import { Router } from 'express';
import fs from 'node:fs';
import { storageService } from '../services/storage.js';

const router = Router();

// GET /api/assets/:filename
router.get('/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = storageService.getOutputPath(filename) || storageService.getUploadPath(filename);

  if (!filePath) {
    res.status(404).json({ error: 'Asset not found or invalid filename' });
    return;
  }

  const mimeType = storageService.getMimeType(filename);
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Cache-Control', 'public, max-age=86400');

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
});

export default router;
