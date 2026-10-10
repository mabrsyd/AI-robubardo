import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { CONFIG } from './config.js';
import generationRouter from './routes/generation.js';
import healthRouter from './routes/health.js';
import uploadRouter from './routes/upload.js';
import assetsRouter from './routes/assets.js';
import { jobQueue } from './services/jobQueue.js';
import { storageService } from './services/storage.js';

// Initialize storage directories
storageService.ensureDirs();

const app = express();

app.use(cors({
  origin: true,
  credentials: true,
}));

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Mount routes
app.use('/api', generationRouter);
app.use('/api/health', healthRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/assets', assetsRouter);

// Root greeting
app.get('/', (_req, res) => {
  res.json({
    name: 'AI Visual Studio API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      generate: 'POST /api/generate',
      jobs: 'GET /api/jobs',
      jobStatus: 'GET /api/jobs/:id',
      upload: 'POST /api/upload',
      assets: 'GET /api/assets/:filename',
    },
  });
});

// Start the sequential job worker
jobQueue.start(1200);

const port = CONFIG.port;
app.listen(port, () => {
  console.log(`\n=================================================`);
  console.log(`  AI Visual Studio API Server`);
  console.log(`  Listening at: http://127.0.0.1:${port}`);
  console.log(`  ComfyUI URL : ${CONFIG.comfyuiUrl}`);
  console.log(`  Target GPU  : NVIDIA RTX 2050 (4GB VRAM)`);
  console.log(`=================================================\n`);
});
