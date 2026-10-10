import { Router } from 'express';
import { comfyClient } from '../services/comfyui.js';
import { dbService } from '../services/db.js';
import { CONFIG } from '../config.js';

const router = Router();

router.get('/', async (_req, res) => {
  const comfyStatus = await comfyClient.checkConnection(2500);
  let checkpoints: string[] = [];
  let queueInfo: any = null;

  if (comfyStatus.connected) {
    try {
      checkpoints = await comfyClient.getAvailableCheckpoints();
      queueInfo = await comfyClient.getQueue();
    } catch {
      // ignore
    }
  }

  const recentJobs = dbService.listJobs(5);
  const queuedJobCount = dbService.getNextQueuedJob() ? 1 : 0;

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    backend: {
      version: '1.0.0',
      uptimeSeconds: Math.floor(process.uptime()),
      nodeEnv: CONFIG.nodeEnv,
      mockMode: CONFIG.mockGeneration,
    },
    comfyui: {
      ...comfyStatus,
      checkpoints,
      queue: queueInfo,
    },
    system: {
      targetGpu: 'NVIDIA RTX 2050 (4GB VRAM)',
      batchLimit: 1,
      defaultResolution: '512x512',
    },
    stats: {
      pendingJobs: queuedJobCount,
      recentJobsCount: recentJobs.length,
    },
  });
});

export default router;
