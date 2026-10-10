import { dbService, type GenerationJob } from './db.js';
import { comfyClient } from './comfyui.js';
import { workflowService } from './workflow.js';
import { storageService } from './storage.js';
import { CONFIG } from '../config.js';

export class JobQueueWorker {
  private isRunning = false;
  private isProcessing = false;
  private checkInterval: NodeJS.Timeout | null = null;

  public start(intervalMs = 1500): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.recoverStaleJobs();
    this.checkInterval = setInterval(() => this.processNext(), intervalMs);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  private recoverStaleJobs(): void {
    // If server restarted while jobs were in PROCESSING, mark them as FAILED
    const allJobs = dbService.listJobs(100);
    for (const job of allJobs) {
      if (job.status === 'PROCESSING') {
        dbService.updateJob(job.id, {
          status: 'FAILED',
          errorMessage: 'Server restarted while generation was in progress',
        });
      }
    }
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing) return;

    const nextJob = dbService.getNextQueuedJob();
    if (!nextJob) return;

    this.isProcessing = true;
    try {
      await this.executeJob(nextJob);
    } catch (err: any) {
      console.error(`[JobQueue] Uncaught error processing job ${nextJob.id}:`, err);
      dbService.updateJob(nextJob.id, {
        status: 'FAILED',
        errorMessage: err.message ?? 'Unknown error during job execution',
      });
    } finally {
      this.isProcessing = false;
    }
  }

  private async executeJob(job: GenerationJob): Promise<void> {
    // Check if job was cancelled while queued
    const current = dbService.getJob(job.id);
    if (!current || current.status === 'CANCELLED') return;

    dbService.updateJob(job.id, { status: 'PROCESSING', progress: 10 });

    // Step 1: Check ComfyUI connection
    const connection = await comfyClient.checkConnection(3000);

    if (!connection.connected) {
      // If mock generation is enabled, create a high quality synthetic demo image
      if (CONFIG.mockGeneration) {
        await this.handleMockGeneration(job);
        return;
      }

      dbService.updateJob(job.id, {
        status: 'FAILED',
        errorMessage: `ComfyUI is not running or unreachable at ${CONFIG.comfyuiUrl}. Please ensure ComfyUI is running on Windows locally. (${connection.error ?? 'Connection failed'})`,
      });
      return;
    }

    // Step 2: Build workflow graph
    dbService.updateJob(job.id, { progress: 25 });
    let promptGraph;
    try {
      const built = await workflowService.buildPromptGraph({
        workflowType: job.workflowType,
        prompt: job.prompt,
        negativePrompt: job.negativePrompt,
        seed: job.seed,
        width: job.width,
        height: job.height,
        steps: job.steps,
        cfg: job.cfg,
        denoise: job.denoise ?? undefined,
        referenceImageFilename: job.referenceImage ?? undefined,
      });
      promptGraph = built.graph;
    } catch (err: any) {
      dbService.updateJob(job.id, {
        status: 'FAILED',
        errorMessage: `Failed to compile workflow: ${err.message}`,
      });
      return;
    }

    // Step 3: Submit to ComfyUI
    dbService.updateJob(job.id, { progress: 40 });
    let queueRes;
    try {
      queueRes = await comfyClient.queuePrompt(promptGraph);
    } catch (err: any) {
      dbService.updateJob(job.id, {
        status: 'FAILED',
        errorMessage: `ComfyUI prompt submission failed: ${err.message}`,
      });
      return;
    }

    const comfyPromptId = queueRes.prompt_id;
    dbService.updateJob(job.id, { comfyPromptId, progress: 50 });

    // Step 4: Poll ComfyUI history
    const startTime = Date.now();
    const timeoutMs = 600000; // 10 minutes timeout for RTX 2050 (allows cold start model load)
    let completedHistory = null;

    while (Date.now() - startTime < timeoutMs) {
      // Check if job was cancelled
      const freshJob = dbService.getJob(job.id);
      if (freshJob?.status === 'CANCELLED') {
        await comfyClient.interrupt();
        return;
      }

      try {
        const historyMap = await comfyClient.getHistory(comfyPromptId);
        if (historyMap && historyMap[comfyPromptId]) {
          completedHistory = historyMap[comfyPromptId];
          break;
        }
      } catch {
        // history endpoint might be busy, retry
      }

      // Update progress simulation while running
      const elapsed = Date.now() - startTime;
      const simulatedProgress = Math.min(95, Math.floor(50 + (elapsed / 60000) * 45));
      dbService.updateJob(job.id, { progress: simulatedProgress });

      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    if (!completedHistory) {
      dbService.updateJob(job.id, {
        status: 'FAILED',
        errorMessage: 'Generation timed out waiting for ComfyUI execution',
      });
      return;
    }

    // Check if ComfyUI status had an execution error
    if (completedHistory.status?.status_str === 'error') {
      const msg = completedHistory.status?.messages?.[0] ?? 'ComfyUI execution failed';
      dbService.updateJob(job.id, {
        status: 'FAILED',
        errorMessage: `ComfyUI execution error: ${JSON.stringify(msg)}`,
      });
      return;
    }

    // Step 5: Extract image output
    dbService.updateJob(job.id, { progress: 92 });
    let targetImage: { filename: string; subfolder: string; type: string } | null = null;
    for (const output of Object.values(completedHistory.outputs ?? {})) {
      if (output.images && output.images.length > 0) {
        targetImage = output.images[0];
        break;
      }
    }

    if (!targetImage) {
      dbService.updateJob(job.id, {
        status: 'FAILED',
        errorMessage: 'No output images were generated in ComfyUI history',
      });
      return;
    }

    // Download image from ComfyUI /view
    let imageBuffer: Buffer;
    try {
      imageBuffer = await comfyClient.viewImage(targetImage.filename, targetImage.subfolder, targetImage.type);
    } catch (err: any) {
      dbService.updateJob(job.id, {
        status: 'FAILED',
        errorMessage: `Failed to retrieve output image from ComfyUI: ${err.message}`,
      });
      return;
    }

    // Save image to safe local storage
    const saved = await storageService.saveOutputBuffer(imageBuffer, '.png', 'product');

    // Mark COMPLETED
    dbService.updateJob(job.id, {
      status: 'COMPLETED',
      progress: 100,
      outputFilename: saved.filename,
      outputUrl: `/api/assets/${saved.filename}`,
    });
  }

  private async handleMockGeneration(job: GenerationJob): Promise<void> {
    dbService.updateJob(job.id, { progress: 50 });
    await new Promise((r) => setTimeout(r, 800));
    dbService.updateJob(job.id, { progress: 85 });
    await new Promise((r) => setTimeout(r, 600));

    // Generate high quality synthetic studio product PNG
    const { generateGradientPng } = await import('./mockImage.js');
    const imageBuffer = generateGradientPng(job.width, job.height, job.seed);

    const saved = await storageService.saveOutputBuffer(imageBuffer, '.png', 'product_mock');
    dbService.updateJob(job.id, {
      status: 'COMPLETED',
      progress: 100,
      outputFilename: saved.filename,
      outputUrl: `/api/assets/${saved.filename}`,
    });
  }
}

export const jobQueue = new JobQueueWorker();
