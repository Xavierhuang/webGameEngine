/**
 * Scene lighting presets — sets a whole vibe (colors + intensities + fog)
 * with one pick, instead of forcing a kid to tune five lights by hand.
 *
 * Presets apply on top of the base rig in `components/three/SceneLights.tsx`.
 * A preset with all-null overrides falls back to the default rig from
 * `lib/constants/game.ts`.
 *
 * Persistence: written to localStorage per-scene under
 * `lingplay.scene.<sceneId>.lighting`. Kept out of the DB in this pass so
 * no schema migration is required — a later change can move the field
 * onto `scenes.properties.lighting_preset` once we're happy with the four.
 */

export type LightingPresetId = 'default' | 'sunset' | 'night' | 'underwater' | 'space';

export interface LightingPreset {
  id: LightingPresetId;
  /** Displayed via i18n key `editor.lighting.preset.<id>`. */
  label: LightingPresetId;
  /** RGB colour applied to the whole rig. Null = keep the default white. */
  color: string | null;
  /** Multiplier on the base rig's total intensity. 1 = unchanged. */
  intensity: number;
  /** Optional exponential fog. Null = no fog. */
  fog: { color: string; near: number; far: number } | null;
  /** Optional sky colour override (fills behind the scene). */
  skyColor: string | null;
}

export const LIGHTING_PRESETS: LightingPreset[] = [
  {
    id: 'default',
    label: 'default',
    color: null,
    intensity: 1,
    fog: null,
    skyColor: null,
  },
  {
    id: 'sunset',
    label: 'sunset',
    color: '#ffcc99',
    intensity: 0.85,
    fog: { color: '#ffb27a', near: 40, far: 220 },
    skyColor: '#f9a26c',
  },
  {
    id: 'night',
    label: 'night',
    color: '#88a0d0',
    intensity: 0.35,
    fog: { color: '#0b1836', near: 20, far: 160 },
    skyColor: '#0f1c3e',
  },
  {
    id: 'underwater',
    label: 'underwater',
    color: '#7fd6ff',
    intensity: 0.7,
    fog: { color: '#1a6b9e', near: 15, far: 120 },
    skyColor: '#186a95',
  },
  {
    id: 'space',
    label: 'space',
    color: '#c8c8ff',
    intensity: 0.55,
    fog: null,
    skyColor: '#050815',
  },
];

export const DEFAULT_PRESET: LightingPresetId = 'default';

export function presetById(id: string | null | undefined): LightingPreset {
  return LIGHTING_PRESETS.find((p) => p.id === id) ?? LIGHTING_PRESETS[0];
}

/**
 * Narrow an arbitrary string (or null / undefined) into a `LightingPresetId`
 * when it names a known preset, else return undefined. Servers hand back
 * `scenes.lighting_preset` as an untyped `string | null`; callers that need
 * the strict prop shape route it through this instead of casting.
 */
export function coerceLightingPreset(id: string | null | undefined): LightingPresetId | undefined {
  const found = LIGHTING_PRESETS.find((p) => p.id === id);
  return found?.id;
}

/** Storage key convention. Exported so tests + tooling can list/wipe. */
export function storageKeyForScene(sceneId: string): string {
  return `lingplay.scene.${sceneId}.lighting`;
}

/** Read the persisted preset for a scene. SSR-safe (returns 'default'). */
export function readScenePreset(sceneId: string): LightingPresetId {
  if (typeof window === 'undefined') return DEFAULT_PRESET;
  try {
    const raw = window.localStorage.getItem(storageKeyForScene(sceneId));
    if (!raw) return DEFAULT_PRESET;
    return (LIGHTING_PRESETS.find((p) => p.id === raw)?.id) ?? DEFAULT_PRESET;
  } catch {
    return DEFAULT_PRESET;
  }
}

/** Write the preset for a scene. No-op on SSR / private mode. */
export function writeScenePreset(sceneId: string, presetId: LightingPresetId): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKeyForScene(sceneId), presetId);
  } catch {
    /* ignore */
  }
}
