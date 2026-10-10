import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { dbService } from '../services/db.js';
import { storageService } from '../services/storage.js';
import { CONFIG } from '../config.js';

const router = Router();

// POST /api/generate
router.post('/generate', async (req, res) => {
  try {
    const {
      prompt,
      negativePrompt = 'blurry, low quality, distorted, extra limbs, poorly drawn, artifacts, watermark, lowres, oversaturated',
      seed = Math.floor(Math.random() * 2147483647),
      width = CONFIG.defaultWidth,
      height = CONFIG.defaultHeight,
      steps = CONFIG.defaultSteps,
      cfg = CONFIG.defaultCfg,
      denoise = 0.65,
      workflowType = 'txt2img',
      referenceImage = null,
    } = req.body ?? {};

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      res.status(400).json({ error: 'Prompt is required and must not be empty' });
      return;
    }

    // RTX 2050 4GB Safety: Limit resolution and steps to prevent out-of-memory
    const clampedWidth = Math.max(256, Math.min(768, Math.floor(Number(width) / 64) * 64 || 512));
    const clampedHeight = Math.max(256, Math.min(768, Math.floor(Number(height) / 64) * 64 || 512));
    const clampedSteps = Math.max(10, Math.min(35, Number(steps) || 20));
    const cleanSeed = Math.abs(Number(seed)) || Math.floor(Math.random() * 2147483647);
    const cleanCfg = Math.max(1.0, Math.min(15.0, Number(cfg) || 7.0));
    const cleanDenoise = Math.max(0.1, Math.min(1.0, Number(denoise) || 0.65));

    const jobId = `job_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    const newJob = dbService.createJob({
      id: jobId,
      status: 'QUEUED',
      workflowType: workflowType === 'img2img' ? 'img2img' : 'txt2img',
      prompt: prompt.trim(),
      negativePrompt: String(negativePrompt).trim(),
      width: clampedWidth,
      height: clampedHeight,
      seed: cleanSeed,
      steps: clampedSteps,
      cfg: cleanCfg,
      denoise: cleanDenoise,
      referenceImage: referenceImage ? String(referenceImage) : null,
    });

    res.status(202).json({
      jobId: newJob.id,
      status: newJob.status,
      message: 'Generation job queued successfully',
      job: newJob,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Failed to submit generation job' });
  }
});

// GET /api/jobs
router.get('/jobs', (_req, res) => {
  try {
    const jobs = dbService.listJobs(30);
    res.json({ jobs });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Failed to retrieve jobs' });
  }
});

// GET /api/jobs/:id
router.get('/jobs/:id', (req, res) => {
  try {
    const job = dbService.getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    res.json({ job });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Failed to retrieve job' });
  }
});

// POST /api/jobs/:id/cancel
router.post('/jobs/:id/cancel', (req, res) => {
  try {
    const job = dbService.getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    if (job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELLED') {
      res.status(400).json({ error: `Cannot cancel job in state ${job.status}` });
      return;
    }

    const updated = dbService.updateJob(job.id, {
      status: 'CANCELLED',
      errorMessage: 'Cancelled by user',
    });

    res.json({ message: 'Job cancelled', job: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Failed to cancel job' });
  }
});

// GET /api/jobs/:id/download
router.get('/jobs/:id/download', (req, res) => {
  try {
    const job = dbService.getJob(req.params.id);
    if (!job || !job.outputFilename) {
      res.status(404).json({ error: 'Output image not found for this job' });
      return;
    }

    const filePath = storageService.getOutputPath(job.outputFilename);
    if (!filePath) {
      res.status(404).json({ error: 'Asset file not found on disk' });
      return;
    }

    const downloadName = `product_${job.id}.png`;
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Content-Type', 'image/png');

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Failed to download asset' });
  }
});

// GET /api/jobs/:id/image
router.get('/jobs/:id/image', (req, res) => {
  try {
    const job = dbService.getJob(req.params.id);
    if (!job || !job.outputFilename) {
      res.status(404).json({ error: 'Output image not found for this job' });
      return;
    }

    const filePath = storageService.getOutputPath(job.outputFilename);
    if (!filePath) {
      res.status(404).json({ error: 'Asset file not found on disk' });
      return;
    }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Failed to stream asset' });
  }
});

export default router;
