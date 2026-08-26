/**
 * Builds a project snapshot that passes every fixed world-release check.
 *
 * Derived from the live `platformer` catalog template rather than hand-written,
 * so a template change that would break real submissions breaks these fixtures
 * too instead of letting a stale hand-rolled scene keep the suite green.
 *
 * Shared by the Task 3 check integration tests, the Task 5 route integration
 * tests, and the Task 9 end-to-end journey — one definition of "a candidate
 * that should reach review".
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const BUILD_ROOT = path.resolve(import.meta.dirname, '../.build');
const { getWorldTemplate, materializeTemplateObjectProperties } = require(path.join(BUILD_ROOT, 'lib/worlds/templates.js'));

export function fixtureUuid(prefix, index) {
  return `${String(prefix + index).padStart(8, '0')}-0000-4000-8000-000000000000`;
}

function serializeNestedBlock(block) {
  return { id: block.id, block_type: block.block_type, ...serializeBlock(block) };
}

function serializeBlock(block) {
  return {
    inputs: block.inputs ?? {},
    ...(block.children ? { children: block.children.map(serializeNestedBlock) } : {}),
    ...(block.elseChildren ? { elseChildren: block.elseChildren.map(serializeNestedBlock) } : {}),
  };
}

/**
 * @param {object} options
 * @param {string} [options.projectId]  Defaults to a deterministic fixture UUID.
 * @param {string} [options.ownerId]    Defaults to a deterministic fixture UUID.
 * @param {number} [options.revision]   Project revision the snapshot pins.
 * @param {string} [options.title]      Public title; must stay link-free and untrimmed-safe.
 * @param {string} [options.templateId]
 * @param {number} [options.templateVersion]
 */
export function buildPassingWorldSnapshot({
  projectId = fixtureUuid(1, 0),
  ownerId = fixtureUuid(2, 0),
  revision = 3,
  title = 'Sky Steps Remix',
  description = 'A friendly climb.',
  templateId = 'platformer',
  templateVersion = 2,
} = {}) {
  const template = getWorldTemplate(templateId, templateVersion);
  assert.ok(template?.active, 'fixture must use an active catalog template');
  let objectIndex = 0;
  let blockIndex = 0;

  return {
    project: {
      id: projectId, owner_id: ownerId, title, description,
      thumbnail_url: template.cardArt, visibility: 'private', genre: template.genre,
      is_published: false, moderation_status: 'draft', revision,
    },
    scenes: template.scenes.map((scene, sceneIndex) => {
      const sceneId = fixtureUuid(3, sceneIndex);
      return {
        id: sceneId, project_id: projectId, name: scene.name, order_index: sceneIndex,
        background_color: scene.backgroundColor, background_image_url: scene.backgroundImageUrl,
        lighting_preset: null, physics_enabled: true, gravity_y: -9.8,
        objects: scene.objects.map((object, index) => {
          const objectId = fixtureUuid(4, objectIndex++);
          return {
            id: objectId, scene_id: sceneId, type: object.type, name: object.name,
            position_x: object.position[0], position_y: object.position[1], position_z: object.position[2],
            rotation: 0, scale_x: 1, scale_y: 1, sprite_url: null, color: object.color ?? null,
            width: null, height: null, has_physics: false, is_static: false, mass: 1,
            properties: materializeTemplateObjectProperties(object), order_index: index,
            logic_blocks: object.blocks.map((block, blockOrder) => ({
              id: fixtureUuid(5, blockIndex++), game_object_id: objectId, project_id: projectId, scene_id: sceneId,
              block_type: block.block_type, category: 'runtime', parent_block_id: null, order_index: blockOrder,
              block_data: serializeBlock(block),
            })),
          };
        }),
      };
    }),
    assets: [],
  };
}
