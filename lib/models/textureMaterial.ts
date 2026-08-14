import * as THREE from 'three';

/**
 * Apply a drawn texture (from the paint editor) to every material under an
 * object, and revert cleanly when it is removed.
 *
 * Shared by the editor's SceneView and the player so a drawing looks the same
 * in both — the same reason lib/models/modelRenderContract.ts exists.
 */
export function applyTexture(
  root: THREE.Object3D | null,
  url: string | null | undefined,
  cache: { url: string | null; texture: THREE.Texture | null }
): void {
  if (!root) return;

  if (!url) {
    if (cache.texture) {
      cache.texture.dispose();
      cache.texture = null;
      cache.url = null;
      root.traverse((child: any) => {
        const mats = Array.isArray(child?.material) ? child.material : child?.material ? [child.material] : [];
        for (const m of mats) {
          if (m && m.map) {
            m.map = null;
            m.needsUpdate = true;
          }
        }
      });
    }
    return;
  }

  if (cache.url === url && cache.texture) return;

  const texture = new THREE.TextureLoader().load(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  cache.texture?.dispose();
  cache.texture = texture;
  cache.url = url;

  root.traverse((child: any) => {
    const mats = Array.isArray(child?.material) ? child.material : child?.material ? [child.material] : [];
    for (const m of mats) {
      if (!m) continue;
      m.map = texture;
      // A dark base colour would tint the drawing; white shows it as painted.
      if (m.color?.set) m.color.set('#ffffff');
      m.needsUpdate = true;
    }
  });
}
