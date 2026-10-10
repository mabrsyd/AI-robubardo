import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { STORAGE_DIR } from '../config.js';

export type JobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface GenerationJob {
  id: string;
  status: JobStatus;
  workflowType: 'txt2img' | 'img2img';
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  seed: number;
  steps: number;
  cfg: number;
  referenceImage?: string | null;
  comfyPromptId?: string | null;
  errorMessage?: string | null;
  outputFilename?: string | null;
  outputUrl?: string | null;
  progress: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

export class DatabaseService {
  private db: DatabaseSync;

  constructor() {
    if (!fs.existsSync(STORAGE_DIR)) {
      fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }
    const dbPath = path.resolve(STORAGE_DIR, 'jobs.db');
    this.db = new DatabaseSync(dbPath);
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        workflow_type TEXT NOT NULL,
        prompt TEXT NOT NULL,
        negative_prompt TEXT,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        seed INTEGER NOT NULL,
        steps INTEGER NOT NULL,
        cfg REAL NOT NULL,
        reference_image TEXT,
        comfy_prompt_id TEXT,
        error_message TEXT,
        output_filename TEXT,
        output_url TEXT,
        progress INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
      CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
    `);
  }

  public createJob(job: Omit<GenerationJob, 'progress' | 'createdAt' | 'updatedAt'>): GenerationJob {
    const now = new Date().toISOString();
    const fullJob: GenerationJob = {
      ...job,
      progress: 0,
      createdAt: now,
      updatedAt: now,
    };

    const stmt = this.db.prepare(`
      INSERT INTO jobs (
        id, status, workflow_type, prompt, negative_prompt,
        width, height, seed, steps, cfg, reference_image,
        comfy_prompt_id, error_message, output_filename, output_url,
        progress, created_at, updated_at, completed_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?
      )
    `);

    stmt.run(
      fullJob.id,
      fullJob.status,
      fullJob.workflowType,
      fullJob.prompt,
      fullJob.negativePrompt ?? '',
      fullJob.width,
      fullJob.height,
      fullJob.seed,
      fullJob.steps,
      fullJob.cfg,
      fullJob.referenceImage ?? null,
      fullJob.comfyPromptId ?? null,
      fullJob.errorMessage ?? null,
      fullJob.outputFilename ?? null,
      fullJob.outputUrl ?? null,
      fullJob.progress,
      fullJob.createdAt,
      fullJob.updatedAt,
      fullJob.completedAt ?? null
    );

    return fullJob;
  }

  public getJob(id: string): GenerationJob | null {
    const stmt = this.db.prepare('SELECT * FROM jobs WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapRowToJob(row);
  }

  public listJobs(limit = 30): GenerationJob[] {
    const stmt = this.db.prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?');
    const rows = stmt.all(limit) as Record<string, unknown>[];
    return rows.map((r) => this.mapRowToJob(r));
  }

  public getNextQueuedJob(): GenerationJob | null {
    const stmt = this.db.prepare("SELECT * FROM jobs WHERE status = 'QUEUED' ORDER BY created_at ASC LIMIT 1");
    const row = stmt.get() as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapRowToJob(row);
  }

  public updateJob(id: string, updates: Partial<GenerationJob>): GenerationJob | null {
    const existing = this.getJob(id);
    if (!existing) return null;

    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    if (updates.status === 'COMPLETED' || updates.status === 'FAILED' || updates.status === 'CANCELLED') {
      if (!updated.completedAt) {
        updated.completedAt = new Date().toISOString();
      }
    }

    const stmt = this.db.prepare(`
      UPDATE jobs SET
        status = ?,
        comfy_prompt_id = ?,
        error_message = ?,
        output_filename = ?,
        output_url = ?,
        progress = ?,
        updated_at = ?,
        completed_at = ?
      WHERE id = ?
    `);

    stmt.run(
      updated.status,
      updated.comfyPromptId ?? null,
      updated.errorMessage ?? null,
      updated.outputFilename ?? null,
      updated.outputUrl ?? null,
      updated.progress,
      updated.updatedAt,
      updated.completedAt ?? null,
      id
    );

    return updated;
  }

  private mapRowToJob(row: Record<string, unknown>): GenerationJob {
    return {
      id: String(row.id),
      status: row.status as JobStatus,
      workflowType: row.workflow_type as 'txt2img' | 'img2img',
      prompt: String(row.prompt),
      negativePrompt: String(row.negative_prompt ?? ''),
      width: Number(row.width),
      height: Number(row.height),
      seed: Number(row.seed),
      steps: Number(row.steps),
      cfg: Number(row.cfg),
      referenceImage: row.reference_image ? String(row.reference_image) : null,
      comfyPromptId: row.comfy_prompt_id ? String(row.comfy_prompt_id) : null,
      errorMessage: row.error_message ? String(row.error_message) : null,
      outputFilename: row.output_filename ? String(row.output_filename) : null,
      outputUrl: row.output_url ? String(row.output_url) : null,
      progress: Number(row.progress ?? 0),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      completedAt: row.completed_at ? String(row.completed_at) : null,
    };
  }
}

export const dbService = new DatabaseService();
