// Minimal Meshy integration to generate 3D models from text prompts.
// Docs may evolve; this client uses a generic async task flow with polling.
// It returns a direct model URL when available or throws with a helpful message.

export interface MeshyGenerateOptions {
  prompt: string;
  model?: string; // future use
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export interface MeshyGenerateResult {
  taskId: string;
  status: 'queued' | 'processing' | 'succeeded' | 'failed';
  modelUrl?: string;
  thumbnailUrl?: string;
  raw?: any;
}

const BASE_URL = 'https://api.meshy.ai';

function getApiKey(): string {
  const key = process.env.MESHY_API_KEY || '';
  if (!key) {
    throw new Error('MESHY_API_KEY is not set');
  }
  if (!key.startsWith('msy_')) {
    // Meshy keys typically start with msy_
    throw new Error('MESHY_API_KEY looks invalid. It should start with "msy_".');
  }
  return key.trim();
}

export async function createTextTo3DTask(prompt: string): Promise<{ taskId: string; raw: any }> {
  const apiKey = getApiKey();
  const createRes = await fetch(`${BASE_URL}/v2/text-to-3d`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      prompt,
      output_format: 'gltf',
    }),
  });
  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Meshy create task failed: ${createRes.status} ${text}`);
  }
  const json = await createRes.json();
  const taskId = json.task_id || json.id;
  if (!taskId) throw new Error('Meshy did not return a task id');
  return { taskId, raw: json };
}

export async function getTaskStatus(taskId: string): Promise<MeshyGenerateResult> {
  const apiKey = getApiKey();
  const statusRes = await fetch(`${BASE_URL}/v2/tasks/${taskId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!statusRes.ok) {
    const text = await statusRes.text();
    throw new Error(`Meshy task status failed: ${statusRes.status} ${text}`);
  }
  const statusJson = await statusRes.json();
  const status = (statusJson.status || statusJson.state || '').toLowerCase();
  const modelUrl: string | undefined =
    statusJson.output?.model_url ||
    statusJson.result?.model_url ||
    statusJson.assets?.gltf ||
    statusJson.model_url;
  const thumbnailUrl: string | undefined =
    statusJson.output?.thumbnail || statusJson.thumbnail || statusJson.preview_url;
  if (status === 'succeeded' || status === 'completed' || status === 'success') {
    return { taskId, status: 'succeeded', modelUrl, thumbnailUrl, raw: statusJson } as any;
  }
  if (status === 'failed' || status === 'error') {
    return { taskId, status: 'failed', raw: statusJson } as any;
  }
  return { taskId, status: 'processing', raw: statusJson } as any;
}

export async function generateTextTo3D(options: MeshyGenerateOptions): Promise<MeshyGenerateResult> {
  const apiKey = getApiKey();
  const timeoutMs = options.timeoutMs ?? 180_000; // 3 minutes
  const pollIntervalMs = options.pollIntervalMs ?? 3_000;

  // 1) Create generation task
  // Endpoint names may vary; using a conservative path that Meshy commonly exposes.
  // If Meshy changes, adjust the path strings only here.
  const createRes = await fetch(`${BASE_URL}/v2/text-to-3d`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      prompt: options.prompt,
      output_format: 'gltf', // prefer glTF for web
      // quality and other options can be added later
    }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Meshy create task failed: ${createRes.status} ${text}`);
  }

  const createJson = await createRes.json();
  const taskId: string = createJson.task_id || createJson.id;
  if (!taskId) {
    throw new Error('Meshy did not return a task id');
  }

  // 2) Poll task status until completion or timeout
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    const statusRes = await fetch(`${BASE_URL}/v2/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!statusRes.ok) {
      const text = await statusRes.text();
      throw new Error(`Meshy task status failed: ${statusRes.status} ${text}`);
    }
    const statusJson = await statusRes.json();
    const status = (statusJson.status || statusJson.state || '').toLowerCase();

    if (status === 'succeeded' || status === 'completed' || status === 'success') {
      const modelUrl: string | undefined =
        statusJson.output?.model_url ||
        statusJson.result?.model_url ||
        statusJson.assets?.gltf ||
        statusJson.model_url;
      const thumbnailUrl: string | undefined =
        statusJson.output?.thumbnail || statusJson.thumbnail || statusJson.preview_url;

      if (!modelUrl) {
        return { taskId, status: 'succeeded', raw: statusJson };
      }

      return { taskId, status: 'succeeded', modelUrl, thumbnailUrl, raw: statusJson };
    }

    if (status === 'failed' || status === 'error') {
      throw new Error(`Meshy generation failed for task ${taskId}`);
    }
  }

  return { taskId, status: 'processing' };
}


