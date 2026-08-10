import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface GameObject {
  id: string;
  scene_id: string;
  type: string;
  name: string;
  position_x: number;
  position_y: number;
  position_z: number;
  rotation: number;
  scale_x: number;
  scale_y: number;
  color?: string;
  has_physics: boolean;
  properties: any;
}

export function useGameEditor(projectId: string) {
  const [selectedObject, setSelectedObject] = useState<GameObject | null>(null);
  const [objects, setObjects] = useState<GameObject[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const supabase = createClient();

  const loadObjects = useCallback(
    async (sceneId: string) => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('game_objects')
          .select('*')
          .eq('scene_id', sceneId);

        if (error) throw error;
        setObjects(data || []);
      } catch (error) {
        console.error('Failed to load objects:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [supabase]
  );

  const addObject = useCallback(
    async (sceneId: string, objectData: Partial<GameObject>) => {
      try {
        const { data, error } = await supabase
          .from('game_objects')
          .insert({
            scene_id: sceneId,
            ...objectData,
          })
          .select()
          .single();

        if (error) throw error;
        setObjects((prev) => [...prev, data]);
        return data;
      } catch (error) {
        console.error('Failed to add object:', error);
        return null;
      }
    },
    [supabase]
  );

  const updateObject = useCallback(
    async (objectId: string, updates: Partial<GameObject>) => {
      try {
        const { data, error } = await supabase
          .from('game_objects')
          .update(updates)
          .eq('id', objectId)
          .select()
          .single();

        if (error) throw error;

        setObjects((prev) =>
          prev.map((obj) => (obj.id === objectId ? data : obj))
        );

        if (selectedObject?.id === objectId) {
          setSelectedObject(data);
        }

        return data;
      } catch (error) {
        console.error('Failed to update object:', error);
        return null;
      }
    },
    [supabase, selectedObject]
  );

  const deleteObject = useCallback(
    async (objectId: string) => {
      try {
        const { error } = await supabase
          .from('game_objects')
          .delete()
          .eq('id', objectId);

        if (error) throw error;

        setObjects((prev) => prev.filter((obj) => obj.id !== objectId));

        if (selectedObject?.id === objectId) {
          setSelectedObject(null);
        }

        return true;
      } catch (error) {
        console.error('Failed to delete object:', error);
        return false;
      }
    },
    [supabase, selectedObject]
  );

  const duplicateObject = useCallback(
    async (objectId: string) => {
      const object = objects.find((obj) => obj.id === objectId);
      if (!object) return null;

      const { id, ...objectData } = object;
      return addObject(object.scene_id, {
        ...objectData,
        name: `${objectData.name} (copy)`,
        position_x: objectData.position_x + 1,
        position_y: objectData.position_y + 1,
      });
    },
    [objects, addObject]
  );

  return {
    objects,
    selectedObject,
    isLoading,
    setSelectedObject,
    loadObjects,
    addObject,
    updateObject,
    deleteObject,
    duplicateObject,
  };
}

