import crypto from 'node:crypto';
import { CONFIG } from '../config.js';

export type ComfyGraph = Record<string, {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: Record<string, unknown>;
}>;

export interface ComfyQueueResponse {
  prompt_id: string;
  number?: number;
  node_errors?: Record<string, unknown>;
}

export interface ComfyHistoryOutputImage {
  filename: string;
  subfolder: string;
  type: string;
}

export interface ComfyHistoryOutput {
  images?: ComfyHistoryOutputImage[];
  gifs?: ComfyHistoryOutputImage[];
}

export interface ComfyHistoryItem {
  prompt: [number, string, Record<string, unknown>, Record<string, unknown>, string[]];
  outputs: Record<string, ComfyHistoryOutput>;
  status?: {
    status_str: string;
    completed: boolean;
    messages?: unknown[];
  };
}

export interface ComfyConnectionStatus {
  connected: boolean;
  url: string;
  version?: string;
  queueRemaining?: number;
  devices?: Array<{ name: string; vram_total: number; vram_free: number; torch_vram_total: number }>;
  error?: string;
}

export class ComfyUIClient {
  private readonly baseUrl: string;

  constructor(baseUrl = CONFIG.comfyuiUrl) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public async checkConnection(timeoutMs = 4000): Promise<ComfyConnectionStatus> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(`${this.baseUrl}/system_stats`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        return {
          connected: false,
          url: this.baseUrl,
          error: `ComfyUI responded with HTTP ${res.status}`,
        };
      }

      const data = await res.json() as any;
      const devices = data?.devices?.map((d: any) => ({
        name: d.name,
        vram_total: Math.round((d.vram_total ?? 0) / (1024 * 1024)),
        vram_free: Math.round((d.vram_free ?? 0) / (1024 * 1024)),
        torch_vram_total: Math.round((d.torch_vram_total ?? 0) / (1024 * 1024)),
      })) ?? [];

      return {
        connected: true,
        url: this.baseUrl,
        version: data?.system?.comfyui_version ?? 'unknown',
        devices,
      };
    } catch (err: any) {
      return {
        connected: false,
        url: this.baseUrl,
        error: err.name === 'AbortError' ? 'Connection timed out' : (err.message ?? 'Cannot reach ComfyUI'),
      };
    }
  }

  public async getAvailableCheckpoints(): Promise<string[]> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${this.baseUrl}/object_info/CheckpointLoaderSimple`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) return [];
      const info = await res.json() as any;
      const ckptNames = info?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0];
      return Array.isArray(ckptNames) ? ckptNames : [];
    } catch {
      return [];
    }
  }

  public async queuePrompt(prompt: ComfyGraph, clientId = crypto.randomUUID()): Promise<ComfyQueueResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(`${this.baseUrl}/prompt`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, client_id: clientId }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const text = await res.text();
        let errMsg = `ComfyUI /prompt error (${res.status}): ${text}`;
        try {
          const jsonErr = JSON.parse(text);
          if (jsonErr.error) errMsg = `ComfyUI: ${jsonErr.error.message ?? JSON.stringify(jsonErr.error)}`;
          if (jsonErr.node_errors) errMsg += ` - Node errors: ${JSON.stringify(jsonErr.node_errors)}`;
        } catch {
          // keep text
        }
        throw new Error(errMsg);
      }

      const data = await res.json() as ComfyQueueResponse;
      if (data.node_errors && Object.keys(data.node_errors).length > 0) {
        throw new Error(`ComfyUI Node Validation Error: ${JSON.stringify(data.node_errors)}`);
      }
      return data;
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') throw new Error('ComfyUI /prompt request timed out');
      throw err;
    }
  }

  public async getHistory(promptId: string): Promise<Record<string, ComfyHistoryItem>> {
    const res = await fetch(`${this.baseUrl}/history/${encodeURIComponent(promptId)}`);
    if (!res.ok) {
      throw new Error(`ComfyUI /history returned ${res.status}: ${await res.text()}`);
    }
    return await res.json() as Record<string, ComfyHistoryItem>;
  }

  public async getQueue(): Promise<{ queue_running: any[]; queue_pending: any[] }> {
    const res = await fetch(`${this.baseUrl}/queue`);
    if (!res.ok) {
      throw new Error(`ComfyUI /queue returned ${res.status}: ${await res.text()}`);
    }
    return await res.json() as { queue_running: any[]; queue_pending: any[] };
  }

  public async viewImage(filename: string, subfolder = '', type = 'output'): Promise<Buffer> {
    const params = new URLSearchParams({ filename, subfolder, type });
    const res = await fetch(`${this.baseUrl}/view?${params}`);
    if (!res.ok) {
      throw new Error(`ComfyUI /view returned ${res.status}: ${await res.text()}`);
    }
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  }

  public async interrupt(): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/interrupt`, { method: 'POST' });
    } catch {
      // ignore
    }
  }
}

export const comfyClient = new ComfyUIClient();
