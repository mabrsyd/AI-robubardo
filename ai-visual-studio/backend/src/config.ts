import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root is two levels up from src (backend -> ai-visual-studio)
export const PROJECT_ROOT = path.resolve(__dirname, '../../');
export const STORAGE_DIR = path.resolve(PROJECT_ROOT, 'storage');
export const UPLOADS_DIR = path.resolve(STORAGE_DIR, 'uploads');
export const OUTPUTS_DIR = path.resolve(STORAGE_DIR, 'outputs');
export const TEMP_DIR = path.resolve(STORAGE_DIR, 'temp');
export const WORKFLOWS_DIR = path.resolve(PROJECT_ROOT, 'workflows');

export const CONFIG = {
  port: Number(process.env.PORT ?? 3001),
  comfyuiUrl: process.env.COMFYUI_URL ?? 'http://127.0.0.1:8188',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  mockGeneration: process.env.MOCK_GENERATION === 'true',
  maxUploadSizeBytes: 15 * 1024 * 1024, // 15MB
  allowedImageMimes: ['image/png', 'image/jpeg', 'image/webp', 'image/jpg'],
  allowedImageExtensions: ['.png', '.jpg', '.jpeg', '.webp'],
  // Default specs tailored for RTX 2050 4GB VRAM
  defaultWidth: 512,
  defaultHeight: 512,
  defaultSteps: 20,
  defaultCfg: 7.0,
  defaultSampler: 'euler',
  defaultScheduler: 'normal',
};
