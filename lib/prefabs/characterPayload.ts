import type { ModelBounds, ModelOriginOffset } from '../models/modelRenderContract';

export interface CharacterVisualInput {
  id: string;
  color?: string;
  shape?: string;
  size?: number;
  model_url?: string;
  model_bounds?: ModelBounds;
  model_origin_offset?: ModelOriginOffset;
  thumbnail_url?: string;
  properties?: Record<string, unknown>;
}

export function buildCharacterVisual(character: CharacterVisualInput): {
  spriteData: Record<string, unknown>;
  properties: Record<string, unknown>;
} {
  if (character.model_url) {
    const size = character.size ?? 1;
    const model = {
      shape: 'model',
      model_url: character.model_url,
      thumbnail_url: character.thumbnail_url,
      size,
      ...(character.model_bounds ? { model_bounds: character.model_bounds } : {}),
      ...(character.model_origin_offset
        ? { model_origin_offset: character.model_origin_offset }
        : {}),
    };
    return { spriteData: model, properties: { ...model, characterType: character.id } };
  }

  const primitive = {
    shape: character.shape || 'box',
    color: character.color,
    size: character.size || 50,
  };
  return {
    spriteData: primitive,
    properties: { ...(character.properties || {}), ...primitive, characterType: character.id },
  };
}
