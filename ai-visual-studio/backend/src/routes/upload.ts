import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { UPLOADS_DIR, CONFIG } from '../config.js';

const router = Router();

// Configure Multer storage safely
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = CONFIG.allowedImageExtensions.includes(ext) ? ext : '.png';
    const uniqueName = `ref_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${safeExt}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: CONFIG.maxUploadSizeBytes },
  fileFilter: (_req, file, cb) => {
    if (!CONFIG.allowedImageMimes.includes(file.mimetype)) {
      return cb(new Error('Only PNG, JPG, and WebP images are allowed'));
    }
    cb(null, true);
  },
});

// POST /api/upload
router.post('/', upload.single('referenceImage'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No image file uploaded' });
      return;
    }

    const filename = req.file.filename;

    // Optional sync to ComfyUI input directory if it exists
    const comfyInputDir = path.resolve(process.cwd(), '../../ComfyUI/input');
    if (fs.existsSync(comfyInputDir)) {
      try {
        const dest = path.resolve(comfyInputDir, filename);
        fs.copyFileSync(req.file.path, dest);
      } catch {
        // non-blocking
      }
    }

    res.json({
      success: true,
      filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
      url: `/api/assets/${filename}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Failed to upload image' });
  }
});

export default router;
