/**
 * Shared trust and format checks for 3D models.
 *
 * Game models are parsed in every player's browser, so a model URL is not a
 * generic link field. Keeping the policy here lets the picker, command API,
 * and upload route agree on exactly which model sources are permitted.
 */
export const MODEL_FILE_EXTENSIONS = ['glb', 'gltf', 'obj', 'stl', 'fbx', 'dae'] as const;

export type ModelFileExtension = (typeof MODEL_FILE_EXTENSIONS)[number];

const MODEL_EXTENSION_SET = new Set<string>(MODEL_FILE_EXTENSIONS);
const textDecoder = new TextDecoder();
const MAX_MODEL_URL_LENGTH = 2_048;
const LOCAL_ASSET_EXTENSIONS = new Set([
  'avif', 'dae', 'fbx', 'gif', 'glb', 'gltf', 'jpeg', 'jpg', 'm4a', 'mp3',
  'obj', 'ogg', 'png', 'stl', 'svg', 'wav', 'webm', 'webp',
]);

export interface ModelValidationResult {
  valid: boolean;
  error?: string;
}

export function isModelFileExtension(value: string): value is ModelFileExtension {
  return MODEL_EXTENSION_SET.has(value.toLowerCase());
}

export function getModelExtension(value: string): ModelFileExtension | null {
  const path = value.split(/[?#]/, 1)[0].toLowerCase();
  const extension = path.match(/\.([a-z0-9]+)$/)?.[1];
  return extension && isModelFileExtension(extension) ? extension : null;
}

/**
 * Accept assets served by Lingplay and Meshy-generated models only. External
 * links otherwise cause every player opening a shared game to contact an
 * arbitrary third party, and can send unreviewed file formats to three.js.
 */
export function isTrustedModelUrl(value: string): boolean {
  if (value.length === 0 || value.length > MAX_MODEL_URL_LENGTH) return false;
  if (!getModelExtension(value)) return false;

  if (value.startsWith('/')) {
    try {
      const pathSegments = value.split(/[?#]/, 1)[0].split('/');
      if (pathSegments.some((segment) => decodeURIComponent(segment) === '..')) return false;
    } catch {
      return false;
    }
    return value.startsWith('/models/') || value.startsWith('/uploads/');
  }

  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'meshy.ai' || url.hostname.endsWith('.meshy.ai'));
  } catch {
    return false;
  }
}

function isTrustedLocalAssetPath(value: string, roots: readonly string[]): boolean {
  if (value.length === 0 || value.length > MAX_MODEL_URL_LENGTH || !value.startsWith('/')) return false;
  try {
    const path = value.split(/[?#]/, 1)[0];
    const segments = path.split('/');
    if (segments.some((segment) => decodeURIComponent(segment) === '..')) return false;
    if (!roots.some((root) => path.startsWith(root))) return false;
    const extension = path.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
    return extension !== undefined && LOCAL_ASSET_EXTENSIONS.has(extension);
  } catch {
    return false;
  }
}

/** Shared URL allowlist for every asset that can be replayed by a release. */
export function isTrustedAssetUrl(value: string): boolean {
  return isTrustedModelUrl(value)
    || isTrustedLocalAssetPath(value, ['/backdrops/', '/uploads/textures/', '/uploads/audio/']);
}

/** Catalog starters remain local packaged model/backdrop assets only. */
export function isTrustedTemplateAssetUrl(value: string): boolean {
  return isTrustedLocalAssetPath(value, ['/models/', '/backdrops/']);
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

function readText(bytes: Uint8Array, maxBytes = 256 * 1024): string {
  return textDecoder.decode(bytes.subarray(0, Math.min(bytes.byteLength, maxBytes)));
}

function invalid(extension: string): ModelValidationResult {
  return {
    valid: false,
    error: `The uploaded .${extension} file does not match that model format.`,
  };
}

/**
 * Cheap first-pass checks before persisting an uploaded asset. They do not
 * replace the browser loader, but reject obvious renamed HTML/text blobs and
 * corrupt headers before those assets become part of a project.
 */
export function validateUploadedModelBytes(
  extension: ModelFileExtension,
  bytes: Uint8Array,
): ModelValidationResult {
  if (bytes.byteLength === 0) return invalid(extension);

  if (extension === 'glb') {
    if (bytes.byteLength < 12 || !startsWith(bytes, [0x67, 0x6c, 0x54, 0x46])) return invalid(extension);
    const header = new DataView(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength);
    const version = header.getUint32(4, true);
    const declaredLength = header.getUint32(8, true);
    return version >= 1 && declaredLength === bytes.byteLength ? { valid: true } : invalid(extension);
  }

  const text = readText(bytes);
  if (extension === 'gltf') {
    try {
      const document = JSON.parse(text) as { asset?: { version?: unknown } };
      return typeof document.asset?.version === 'string' ? { valid: true } : invalid(extension);
    } catch {
      return invalid(extension);
    }
  }

  if (extension === 'fbx') {
    return text.startsWith('Kaydara FBX Binary  \0') || text.startsWith('; FBX') ? { valid: true } : invalid(extension);
  }

  if (extension === 'obj') {
    return /(^|\r?\n)\s*(v|o|g|f)\s+/.test(text) ? { valid: true } : invalid(extension);
  }

  if (extension === 'dae') {
    return /<COLLADA(?:\s|>)/i.test(text) ? { valid: true } : invalid(extension);
  }

  // ASCII STL identifies itself with "solid" and has facets. For a binary
  // STL, the size is exactly its 80-byte header + a 4-byte triangle count +
  // 50 bytes per triangle.
  const trimmed = text.trimStart().toLowerCase();
  if (trimmed.startsWith('solid') && /\bfacet\b/.test(trimmed)) return { valid: true };
  if (bytes.byteLength < 84) return invalid(extension);
  const view = new DataView(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength);
  const triangleCount = view.getUint32(80, true);
  return 84 + triangleCount * 50 === bytes.byteLength ? { valid: true } : invalid(extension);
}
