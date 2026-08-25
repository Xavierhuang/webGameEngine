import type { GameObject, LogicBlock, Project, Scene } from '../../types/game';
import { materializeTemplateObjectProperties, type WorldTemplate, type WorldTemplateBlock } from './templates';

type PreviewScene = Scene & { background_image_url?: string | null };

function previewBlock(block: WorldTemplateBlock): LogicBlock {
  return {
    id: block.id,
    block_type: block.block_type as LogicBlock['block_type'],
    ...(block.inputs ? { inputs: block.inputs as LogicBlock['inputs'] } : {}),
    ...(block.children ? { children: block.children.map(previewBlock) } : {}),
    ...(block.elseChildren ? { elseChildren: block.elseChildren.map(previewBlock) } : {}),
  };
}

function previewObject(object: WorldTemplate['scenes'][number]['objects'][number], sceneId: string): GameObject {
  return {
    id: object.id,
    scene_id: sceneId,
    name: object.name,
    type: object.type,
    position_x: object.position[0],
    position_y: object.position[1],
    position_z: object.position[2],
    color: object.color ?? null,
    properties: materializeTemplateObjectProperties(object),
    logic_blocks: object.blocks.map(previewBlock),
  };
}

/**
 * Builds a runtime-shaped project entirely in memory for the template picker.
 * It never has an owner session or database identity, so opening a preview
 * cannot create, save, remix, or publish a child's world.
 */
export function previewProjectFromTemplate(template: WorldTemplate): Project {
  const projectId = `template-preview-${template.id}-v${template.version}`;
  const scenes: PreviewScene[] = template.scenes.map((scene) => {
    const sceneId = `template-preview-${template.id}-v${template.version}-${scene.id}`;
    return {
      id: sceneId,
      project_id: projectId,
      name: scene.name,
      background_color: scene.backgroundColor,
      background_image_url: scene.backgroundImageUrl || null,
      game_objects: scene.objects.map((object) => previewObject(object, sceneId)),
    };
  });

  return {
    id: projectId,
    owner_id: 'template-preview',
    title: template.title,
    description: template.description,
    scenes,
  };
}
