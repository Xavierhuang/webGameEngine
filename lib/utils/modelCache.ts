/**
 * Model caching system for 3D assets
 * Prevents re-loading the same models multiple times
 */

import * as THREE from 'three';
import { logger } from './logger';

interface CachedModel {
  url: string;
  model: THREE.Object3D | THREE.Group;
  animations?: THREE.AnimationClip[];
  loadedAt: number;
  size: number;
  refCount: number; // Reference count for cleanup
}

class ModelCache {
  private cache: Map<string, CachedModel> = new Map();
  private maxCacheSize: number = 100 * 1024 * 1024; // 100MB default
  private maxAge: number = 30 * 60 * 1000; // 30 minutes

  /**
   * Get a model from cache or load it
   */
  async get(url: string): Promise<CachedModel | null> {
    const cached = this.cache.get(url);
    
    if (cached) {
      // Check if cache is still valid
      const age = Date.now() - cached.loadedAt;
      if (age < this.maxAge) {
        cached.refCount++;
        logger.debug(`[ModelCache] Cache hit for ${url} (refCount: ${cached.refCount})`);
        return cached;
      } else {
        // Cache expired, remove it
        logger.debug(`[ModelCache] Cache expired for ${url}, removing`);
        this.cache.delete(url);
      }
    }

    // Not in cache, will need to load
    logger.debug(`[ModelCache] Cache miss for ${url}`);
    return null;
  }

  /**
   * Store a model in cache
   */
  set(url: string, model: THREE.Object3D | THREE.Group, animations?: THREE.AnimationClip[], size?: number): void {
    // Check if we need to free up space
    this.cleanupIfNeeded(size || 0);

    const cached: CachedModel = {
      url,
      model,
      animations,
      loadedAt: Date.now(),
      size: size || this.estimateSize(model),
      refCount: 1,
    };

    this.cache.set(url, cached);
    logger.debug(`[ModelCache] Cached model ${url} (size: ${(cached.size / 1024).toFixed(2)}KB)`);
  }

  /**
   * Release a reference to a cached model
   */
  release(url: string): void {
    const cached = this.cache.get(url);
    if (cached) {
      cached.refCount--;
      logger.debug(`[ModelCache] Released reference to ${url} (refCount: ${cached.refCount})`);
      
      // If no references, mark for cleanup (but don't remove immediately)
      if (cached.refCount <= 0) {
        // Will be cleaned up in next cleanup cycle
      }
    }
  }

  /**
   * Remove a model from cache
   */
  remove(url: string): void {
    const cached = this.cache.get(url);
    if (cached) {
      // Dispose of Three.js resources
      this.disposeModel(cached.model);
      this.cache.delete(url);
      logger.debug(`[ModelCache] Removed ${url} from cache`);
    }
  }

  /**
   * Clear all cached models
   */
  clear(): void {
    this.cache.forEach((cached) => {
      this.disposeModel(cached.model);
    });
    this.cache.clear();
    logger.debug('[ModelCache] Cleared all cached models');
  }

  /**
   * Get cache statistics
   */
  getStats(): { count: number; totalSize: number; totalRefs: number } {
    let totalSize = 0;
    let totalRefs = 0;
    
    this.cache.forEach((cached) => {
      totalSize += cached.size;
      totalRefs += cached.refCount;
    });

    return {
      count: this.cache.size,
      totalSize,
      totalRefs,
    };
  }

  /**
   * Clean up old or unused models if cache is too large
   */
  private cleanupIfNeeded(newModelSize: number): void {
    const stats = this.getStats();
    const currentSize = stats.totalSize + newModelSize;

    if (currentSize <= this.maxCacheSize) {
      return; // No cleanup needed
    }

    logger.debug(`[ModelCache] Cache size (${(currentSize / 1024 / 1024).toFixed(2)}MB) exceeds limit, cleaning up...`);

    // Sort by: 1. refCount (unused first), 2. age (oldest first)
    const entries = Array.from(this.cache.entries()).map(([url, cached]) => ({
      ...cached,
      url,
      age: Date.now() - cached.loadedAt,
    }));

    entries.sort((a, b) => {
      // First sort by refCount (0 first)
      if (a.refCount !== b.refCount) {
        return a.refCount - b.refCount;
      }
      // Then by age (oldest first)
      return b.age - a.age;
    });

    // Remove models until we're under the limit
    for (const entry of entries) {
      if (currentSize - entry.size <= this.maxCacheSize) {
        break;
      }
      this.remove(entry.url);
    }
  }

  /**
   * Estimate memory size of a Three.js object
   */
  private estimateSize(object: THREE.Object3D): number {
    let size = 0;

    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const geometry = child.geometry;
        const material = child.material;

        // Estimate geometry size
        if (geometry.attributes.position) {
          size += geometry.attributes.position.count * 3 * 4; // 3 floats * 4 bytes
        }
        if (geometry.attributes.normal) {
          size += geometry.attributes.normal.count * 3 * 4;
        }
        if (geometry.attributes.uv) {
          size += geometry.attributes.uv.count * 2 * 4;
        }

        // Estimate material size (rough)
        size += 1024; // Base material overhead
      }
    });

    return size;
  }

  /**
   * Properly dispose of Three.js resources
   */
  private disposeModel(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.geometry) {
          child.geometry.dispose();
        }
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((mat) => mat.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });
  }
}

// Export singleton instance
export const modelCache = new ModelCache();

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    modelCache.clear();
  });
}








