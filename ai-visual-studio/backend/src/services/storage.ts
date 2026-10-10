import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { STORAGE_DIR, UPLOADS_DIR, OUTPUTS_DIR, TEMP_DIR, CONFIG } from '../config.js';

export class StorageService {
  constructor() {
    this.ensureDirs();
  }

  public ensureDirs(): void {
    for (const dir of [STORAGE_DIR, UPLOADS_DIR, OUTPUTS_DIR, TEMP_DIR]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  public isSafeFilename(filename: string): boolean {
    if (!filename || typeof filename !== 'string') return false;
    // Reject path traversal attempts like '..' or '/' or '\'
    const base = path.basename(filename);
    if (base !== filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return false;
    }
    const ext = path.extname(filename).toLowerCase();
    return CONFIG.allowedImageExtensions.includes(ext);
  }

  public getSafePath(dir: string, filename: string): string | null {
    if (!this.isSafeFilename(filename)) return null;
    const resolved = path.resolve(dir, filename);
    const resolvedDir = path.resolve(dir);
    if (!resolved.startsWith(resolvedDir)) {
      return null;
    }
    if (!fs.existsSync(resolved)) {
      return null;
    }
    return resolved;
  }

  public getOutputPath(filename: string): string | null {
    return this.getSafePath(OUTPUTS_DIR, filename);
  }

  public getUploadPath(filename: string): string | null {
    return this.getSafePath(UPLOADS_DIR, filename);
  }

  public async saveOutputBuffer(buffer: Buffer, extension = '.png', prefix = 'gen'): Promise<{ filename: string; filePath: string; size: number }> {
    this.ensureDirs();
    const cleanExt = extension.startsWith('.') ? extension : `.${extension}`;
    const timestamp = Date.now();
    const randomHex = crypto.randomBytes(4).toString('hex');
    const filename = `${prefix}_${timestamp}_${randomHex}${cleanExt}`;
    const filePath = path.resolve(OUTPUTS_DIR, filename);

    await fs.promises.writeFile(filePath, buffer);
    const stat = await fs.promises.stat(filePath);

    return {
      filename,
      filePath,
      size: stat.size,
    };
  }

  public getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    switch (ext) {
      case '.png': return 'image/png';
      case '.jpg':
      case '.jpeg': return 'image/jpeg';
      case '.webp': return 'image/webp';
      case '.mp4': return 'video/mp4';
      default: return 'application/octet-stream';
    }
  }
}

export const storageService = new StorageService();
