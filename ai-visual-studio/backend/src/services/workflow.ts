import fs from 'node:fs/promises';
import path from 'node:path';
import { WORKFLOWS_DIR } from '../config.js';
import type { ComfyGraph } from './comfyui.js';

export interface WorkflowMapping {
  id: string;
  name: string;
  description: string;
  workflowFile: string;
  nodes: {
    sampler?: {
      id: string;
      seedField?: string;
      stepsField?: string;
      cfgField?: string;
      samplerNameField?: string;
      schedulerField?: string;
      denoiseField?: string;
    };
    checkpoint?: {
      id: string;
      ckptNameField?: string;
    };
    latent?: {
      id: string;
      widthField?: string;
      heightField?: string;
      batchSizeField?: string;
    };
    positivePrompt?: {
      id: string;
      textField?: string;
    };
    negativePrompt?: {
      id: string;
      textField?: string;
    };
    loadImage?: {
      id: string;
      imageField?: string;
    };
    saveImage?: {
      id: string;
      filenamePrefixField?: string;
    };
  };
  defaults?: {
    width?: number;
    height?: number;
    steps?: number;
    cfg?: number;
    sampler?: string;
    scheduler?: string;
    negativePrompt?: string;
  };
}

export interface BuildWorkflowParams {
  workflowType?: 'txt2img' | 'img2img';
  prompt: string;
  negativePrompt?: string;
  seed?: number;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  checkpoint?: string;
  referenceImageFilename?: string;
  denoise?: number;
}

export class WorkflowService {
  private workflowCache = new Map<string, { mapping: WorkflowMapping; graph: ComfyGraph }>();

  public async getWorkflow(type: 'txt2img' | 'img2img' = 'txt2img'): Promise<{ mapping: WorkflowMapping; graph: ComfyGraph }> {
    if (this.workflowCache.has(type)) {
      return this.workflowCache.get(type)!;
    }

    const configPath = path.resolve(WORKFLOWS_DIR, 'image', `${type}.config.json`);
    const mappingRaw = await fs.readFile(configPath, 'utf8');
    const mapping = JSON.parse(mappingRaw) as WorkflowMapping;

    const graphPath = path.resolve(WORKFLOWS_DIR, 'image', mapping.workflowFile);
    const graphRaw = await fs.readFile(graphPath, 'utf8');
    const graph = JSON.parse(graphRaw) as ComfyGraph;

    const loaded = { mapping, graph };
    this.workflowCache.set(type, loaded);
    return loaded;
  }

  public async buildPromptGraph(params: BuildWorkflowParams): Promise<{ graph: ComfyGraph; mapping: WorkflowMapping }> {
    const type = params.workflowType ?? 'txt2img';
    const { mapping, graph: templateGraph } = await this.getWorkflow(type);

    // Deep clone template graph
    const graph: ComfyGraph = JSON.parse(JSON.stringify(templateGraph));
    const nodes = mapping.nodes;

    // Positive prompt
    if (nodes.positivePrompt?.id) {
      const node = graph[nodes.positivePrompt.id];
      if (!node) throw new Error(`Node ${nodes.positivePrompt.id} for positivePrompt not found in workflow`);
      const field = nodes.positivePrompt.textField ?? 'text';
      node.inputs[field] = params.prompt;
    }

    // Negative prompt
    if (nodes.negativePrompt?.id) {
      const node = graph[nodes.negativePrompt.id];
      if (!node) throw new Error(`Node ${nodes.negativePrompt.id} for negativePrompt not found in workflow`);
      const field = nodes.negativePrompt.textField ?? 'text';
      node.inputs[field] = params.negativePrompt ?? mapping.defaults?.negativePrompt ?? '';
    }

    // Sampler (seed, steps, cfg, sampler_name, scheduler)
    if (nodes.sampler?.id) {
      const node = graph[nodes.sampler.id];
      if (!node) throw new Error(`Node ${nodes.sampler.id} for sampler not found in workflow`);
      if (params.seed !== undefined && nodes.sampler.seedField) {
        node.inputs[nodes.sampler.seedField] = params.seed;
      }
      if (params.steps !== undefined && nodes.sampler.stepsField) {
        node.inputs[nodes.sampler.stepsField] = params.steps;
      }
      if (params.cfg !== undefined && nodes.sampler.cfgField) {
        node.inputs[nodes.sampler.cfgField] = params.cfg;
      }
      if (params.denoise !== undefined && nodes.sampler.denoiseField) {
        node.inputs[nodes.sampler.denoiseField] = params.denoise;
      }
    }

    // Latent (width, height, batch_size)
    if (nodes.latent?.id) {
      const node = graph[nodes.latent.id];
      if (!node) throw new Error(`Node ${nodes.latent.id} for latent not found in workflow`);
      if (params.width !== undefined && nodes.latent.widthField) {
        node.inputs[nodes.latent.widthField] = params.width;
      }
      if (params.height !== undefined && nodes.latent.heightField) {
        node.inputs[nodes.latent.heightField] = params.height;
      }
      if (nodes.latent.batchSizeField) {
        node.inputs[nodes.latent.batchSizeField] = 1; // RTX 2050 4GB safety: strictly batch 1
      }
    }

    // Checkpoint override if provided
    if (params.checkpoint && nodes.checkpoint?.id) {
      const node = graph[nodes.checkpoint.id];
      if (node && nodes.checkpoint.ckptNameField) {
        node.inputs[nodes.checkpoint.ckptNameField] = params.checkpoint;
      }
    }

    // Reference Image (for img2img)
    if (params.referenceImageFilename && nodes.loadImage?.id) {
      const node = graph[nodes.loadImage.id];
      if (node && nodes.loadImage.imageField) {
        node.inputs[nodes.loadImage.imageField] = params.referenceImageFilename;
      }
    }

    return { graph, mapping };
  }
}

export const workflowService = new WorkflowService();
