import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, query, queryOne } from '@/lib/mysql/server';
import { randomUUID } from 'crypto';

/**
 * The logic_blocks table has a single JSON block_data column, so new-style
 * block fields (inputs / children / elseChildren) are folded into it.
 * The interpreter reads them from either location.
 */
function serializeBlockData(block: any): string {
  const data = { ...(block.block_data || block.data || {}) };
  if (block.inputs !== undefined) data.inputs = block.inputs;
  if (block.children !== undefined) data.children = block.children;
  if (block.elseChildren !== undefined) data.elseChildren = block.elseChildren;
  return JSON.stringify(data);
}

export async function POST(request: NextRequest) {
  let update: any;
  try {
    const user = await getAuthenticatedUser();
    const body = await request.json();
    const { projectId, update: updateData } = body;
    update = updateData;

    if (!projectId || !updateData) {
      return NextResponse.json({ error: 'Project ID and update required' }, { status: 400 });
    }

    console.log('Applying update:', JSON.stringify(update, null, 2));

    // Get profile ID (or create guest)
    let profileId: string;
    if (user) {
      const profile = await query<{ id: string }>(
        'SELECT id FROM profiles WHERE user_id = ?',
        [user.id]
      );
      if (!profile || profile.length === 0) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
      }
      profileId = profile[0].id;
    } else {
      // For guests, we'd need to get the project owner
      const project = await queryOne<{ owner_id: string }>(
        'SELECT owner_id FROM projects WHERE id = ?',
        [projectId]
      );
      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
      profileId = project.owner_id;
    }

    // Handle different update formats from AI
    // Format 1: { type: 'create', target: 'gameObject', data: {...} }
    // Format 2: { new_game_object: {...} } (from AI response)
    // Format 3: { scenes: [{ game_objects: [...] }] } (full scene structure from AI)
    // Format 4: { type: 'add_game_object', scene_id: '...', game_object: {...} } (Claude format)
    // Format 5: { type: 'add_logic_blocks', target_object: 'Object Name', logic_blocks: [...] } (Add controls to existing object)
    
    // Check if it's adding logic blocks to an existing object by name
    if (update.type === 'add_logic_blocks' && update.target_object && update.logic_blocks) {
      // Find the game object by name
      const gameObject = await queryOne<{ id: string }>(
        `SELECT id FROM game_objects 
         WHERE scene_id IN (SELECT id FROM scenes WHERE project_id = ?) 
         AND name = ? 
         LIMIT 1`,
        [projectId, update.target_object]
      );

      if (!gameObject) {
        return NextResponse.json({ error: `Game object "${update.target_object}" not found` }, { status: 404 });
      }

      // Add logic blocks
      for (const block of update.logic_blocks) {
        await query(
          `INSERT INTO logic_blocks 
           (id, game_object_id, project_id, block_type, category, order_index, block_data)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            randomUUID(),
            gameObject.id,
            projectId,
            block.block_type || block.type || 'action',
            block.category || 'general',
            block.order_index || 0,
            serializeBlockData(block),
          ]
        );
      }

      // Enable physics if needed
      if (update.enable_physics) {
        await query('UPDATE game_objects SET has_physics = TRUE WHERE id = ?', [gameObject.id]);
      }

      return NextResponse.json({ 
        success: true,
        gameObjectId: gameObject.id,
        message: `Added ${update.logic_blocks.length} logic block(s) to "${update.target_object}"` 
      });
    }
    
    // Check if it's the "add_game_object" format
    if (update.type === 'add_game_object' && update.game_object) {
      const sceneId = update.scene_id || (
        await queryOne<{ id: string }>(
          'SELECT id FROM scenes WHERE project_id = ? ORDER BY order_index LIMIT 1',
          [projectId]
        )
      )?.id;

      if (!sceneId) {
        return NextResponse.json({ error: 'No scene found' }, { status: 404 });
      }

      const gameObj = update.game_object;
      // Derive numeric scales from size fields safely
      const getScaleX = () => {
        const s = gameObj.sprite_data?.size ?? gameObj.size;
        if (typeof s === 'number') return Math.max(0.01, Math.min(100, s / 100));
        if (s && typeof s === 'object') {
          const w = s.width ?? s.w ?? 100;
          return Math.max(0.01, Math.min(100, w / 100));
        }
        return 1;
      };
      const getScaleY = () => {
        const s = gameObj.sprite_data?.size ?? gameObj.size;
        if (typeof s === 'number') return Math.max(0.01, Math.min(100, s / 100));
        if (s && typeof s === 'object') {
          const h = s.height ?? s.h ?? 100;
          return Math.max(0.01, Math.min(100, h / 100));
        }
        return 1;
      };
      const computedScaleX = getScaleX();
      const computedScaleY = getScaleY();
      // Generate UUID if ID is not provided or not a valid UUID format
      let gameObjectId = gameObj.id;
      if (!gameObjectId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(gameObjectId)) {
        gameObjectId = randomUUID();
      }

      try {
        await query(
          `INSERT INTO game_objects 
           (id, scene_id, type, name, position_x, position_y, position_z, scale_x, scale_y, properties)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            gameObjectId,
            sceneId,
            gameObj.type || 'sprite',
            gameObj.name || 'New Object',
            gameObj.position?.x ?? 500, // Default to center
            gameObj.position?.y ?? 300, // Default to center
            gameObj.position?.z || 0,
            computedScaleX,
            computedScaleY,
            JSON.stringify({
              ...(gameObj.properties || {}),
              shape: gameObj.sprite_data?.shape || gameObj.shape,
              color: gameObj.sprite_data?.color || gameObj.color,
              size: gameObj.sprite_data?.size || gameObj.size,
              rotation: gameObj.rotation || 0,
            }),
          ]
        );
      } catch (dbError: any) {
        console.error('Database error inserting game object:', dbError);
        // If it's a duplicate key error, try updating instead
        if (dbError.code === 'ER_DUP_ENTRY' || dbError.message?.includes('Duplicate entry')) {
          console.log('Object already exists, updating instead...');
          await query(
            `UPDATE game_objects 
             SET name = ?, type = ?, position_x = ?, position_y = ?, position_z = ?, 
                 scale_x = ?, scale_y = ?, properties = ?
             WHERE id = ?`,
            [
              gameObj.name || 'Object',
              gameObj.type || 'sprite',
              gameObj.position?.x || 0,
              gameObj.position?.y || 0,
              gameObj.position?.z || 0,
              computedScaleX,
              computedScaleY,
              JSON.stringify({
                ...(gameObj.properties || {}),
                shape: gameObj.sprite_data?.shape || gameObj.shape,
                color: gameObj.sprite_data?.color || gameObj.color,
                size: gameObj.sprite_data?.size || gameObj.size,
                rotation: gameObj.rotation || 0,
              }),
              gameObjectId,
            ]
          );
        } else {
          throw dbError;
        }
      }

      // Add logic blocks if provided
      if (gameObj.logic_blocks && Array.isArray(gameObj.logic_blocks)) {
        for (const block of gameObj.logic_blocks) {
          await query(
            `INSERT INTO logic_blocks 
             (id, game_object_id, project_id, block_type, category, order_index, block_data)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              randomUUID(),
              gameObjectId,
              projectId,
              block.block_type || block.type || 'action',
              block.category || 'general',
              block.order_index || 0,
              serializeBlockData(block),
            ]
          );
        }
      }

      return NextResponse.json({ 
        success: true,
        gameObjectId,
        message: 'Game object added successfully' 
      });
    }
    
    // Check if it's the full scene structure format
    if (update.scenes && Array.isArray(update.scenes)) {
      // Process each scene and its game objects
      for (const scene of update.scenes) {
        const sceneId = scene.id || (
          await queryOne<{ id: string }>(
            'SELECT id FROM scenes WHERE project_id = ? ORDER BY order_index LIMIT 1',
            [projectId]
          )
        )?.id;

        if (!sceneId) {
          console.warn('Scene not found, skipping scene update');
          continue;
        }

        // Update scene if needed
        if (scene.name || scene.background_color) {
          await query(
            'UPDATE scenes SET name = ?, background_color = ? WHERE id = ?',
            [
              scene.name || 'Main Scene',
              scene.background_color || '#87CEEB',
              sceneId,
            ]
          );
        }

        // Process game objects
        if (scene.game_objects && Array.isArray(scene.game_objects)) {
          for (const gameObj of scene.game_objects) {
            // Check if object already exists (only if ID is provided)
            let existing = null;
            if (gameObj.id) {
              existing = await queryOne<{ id: string }>(
                'SELECT id FROM game_objects WHERE id = ?',
                [gameObj.id]
              );
            }

            if (existing) {
              // Update existing object
              await query(
                `UPDATE game_objects 
                 SET name = ?, type = ?, position_x = ?, position_y = ?, position_z = ?, 
                     scale_x = ?, scale_y = ?, properties = ?
                 WHERE id = ?`,
                [
                  gameObj.name || 'Object',
                  gameObj.type || 'sprite',
                  gameObj.position?.x || 0,
                  gameObj.position?.y || 0,
                  gameObj.position?.z || 0,
                  gameObj.size?.width ? gameObj.size.width / 100 : 1,
                  gameObj.size?.height ? gameObj.size.height / 100 : 1,
                  JSON.stringify({
                    ...(gameObj.properties || {}),
                    shape: gameObj.shape,
                    color: gameObj.color,
                    size: gameObj.size,
                    rotation: gameObj.rotation,
                  }),
                  gameObj.id,
                ]
              );
            } else {
              // Create new object
              // Generate UUID if ID is not provided or not a valid UUID format
              let gameObjectId = gameObj.id;
              if (!gameObjectId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(gameObjectId)) {
                gameObjectId = randomUUID();
              }
              
              try {
                await query(
                  `INSERT INTO game_objects 
                   (id, scene_id, type, name, position_x, position_y, position_z, scale_x, scale_y, properties)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  [
                    gameObjectId,
                    sceneId,
                    gameObj.type || 'sprite',
                    gameObj.name || 'New Object',
                    gameObj.position?.x ?? 500, // Default to center (500 = 0 in 3D)
                    gameObj.position?.y ?? 300, // Default to center (300 = 0 in 3D)
                    gameObj.position?.z || 0,
                    gameObj.size?.width ? gameObj.size.width / 100 : 1,
                    gameObj.size?.height ? gameObj.size.height / 100 : 1,
                    JSON.stringify({
                      ...(gameObj.properties || {}),
                      shape: gameObj.shape,
                      color: gameObj.color,
                      size: gameObj.size,
                      rotation: gameObj.rotation,
                    }),
                  ]
                );
              } catch (dbError: any) {
                console.error('Database error inserting game object:', dbError);
                // If it's a duplicate key error, try updating instead
                if (dbError.code === 'ER_DUP_ENTRY' || dbError.message?.includes('Duplicate entry')) {
                  console.log('Object already exists, updating instead...');
                  await query(
                    `UPDATE game_objects 
                     SET name = ?, type = ?, position_x = ?, position_y = ?, position_z = ?, 
                         scale_x = ?, scale_y = ?, properties = ?
                     WHERE id = ?`,
                    [
                      gameObj.name || 'Object',
                      gameObj.type || 'sprite',
                      gameObj.position?.x || 0,
                      gameObj.position?.y || 0,
                      gameObj.position?.z || 0,
                      gameObj.size?.width ? gameObj.size.width / 100 : 1,
                      gameObj.size?.height ? gameObj.size.height / 100 : 1,
                      JSON.stringify({
                        ...(gameObj.properties || {}),
                        shape: gameObj.shape,
                        color: gameObj.color,
                        size: gameObj.size,
                        rotation: gameObj.rotation,
                      }),
                      gameObjectId,
                    ]
                  );
                } else {
                  throw dbError;
                }
              }

              // Add logic blocks if provided
              if (gameObj.logic_blocks && Array.isArray(gameObj.logic_blocks)) {
                for (const block of gameObj.logic_blocks) {
                  await query(
                    `INSERT INTO logic_blocks 
                     (id, game_object_id, project_id, block_type, category, order_index, block_data)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                      randomUUID(),
                      gameObjectId,
                      projectId,
                      block.block_type || block.type || 'action',
                      block.category || 'general',
                      block.order_index || 0,
                      serializeBlockData(block),
                    ]
                  );
                }
              }
            }
          }
        }
      }

      return NextResponse.json({ 
        success: true,
        message: 'Scene and game objects updated successfully' 
      });
    }
    
    // Check if it's the AI response format and convert it
    if (update.new_game_object) {
      // Convert AI format to our format
      update.type = 'create';
      update.target = 'gameObject';
      update.data = {
        type: update.new_game_object.type || 'sprite',
        name: update.new_game_object.name || 'New Object',
        scene_id: update.new_game_object.sceneId,
        position: update.new_game_object.position || { x: 500, y: 300, z: 0 }, // Default to center
        scale: update.new_game_object.scale || { x: 1, y: 1 },
        properties: update.new_game_object.properties || {},
      };
    }

    // Apply the update based on type
    switch (update.type) {
      case 'create':
        if (update.target === 'gameObject') {
          // Create a new game object
          const sceneId = update.data.scene_id || (
            await queryOne<{ id: string }>(
              'SELECT id FROM scenes WHERE project_id = ? ORDER BY order_index LIMIT 1',
              [projectId]
            )
          )?.id;

          if (!sceneId) {
            return NextResponse.json({ error: 'No scene found' }, { status: 404 });
          }

          const gameObjectId = randomUUID();
          await query(
            `INSERT INTO game_objects 
             (id, scene_id, type, name, position_x, position_y, position_z, scale_x, scale_y, properties)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              gameObjectId,
              sceneId,
              update.data.type || 'sprite',
              update.data.name || 'New Object',
              update.data.position?.x ?? 500, // Default to center
              update.data.position?.y ?? 300, // Default to center
              update.data.position?.z || 0,
              update.data.scale?.x || 1,
              update.data.scale?.y || 1,
              JSON.stringify(update.data.properties || {}),
            ]
          );

          // Add logic blocks if provided
          if (update.data.logic_blocks) {
            for (const block of update.data.logic_blocks) {
              await query(
                `INSERT INTO logic_blocks 
                 (id, game_object_id, project_id, block_type, category, order_index, block_data)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                  randomUUID(),
                  gameObjectId,
                  projectId,
                  block.block_type,
                  block.category,
                  block.order_index || 0,
                  serializeBlockData(block),
                ]
              );
            }
          }

          return NextResponse.json({ success: true, gameObjectId });
        }
        break;

      case 'update':
        // Update existing game object
        if (update.target === 'gameObject' && update.data.id) {
          const updateFields: string[] = [];
          const updateValues: any[] = [];

          if (update.data.name !== undefined) {
            updateFields.push('name = ?');
            updateValues.push(update.data.name);
          }
          if (update.data.position) {
            updateFields.push('position_x = ?', 'position_y = ?');
            updateValues.push(update.data.position.x, update.data.position.y);
          }
          if (update.data.properties) {
            updateFields.push('properties = ?');
            updateValues.push(JSON.stringify(update.data.properties));
          }
          if (update.data.has_physics !== undefined) {
            updateFields.push('has_physics = ?');
            updateValues.push(update.data.has_physics);
          }

          if (updateFields.length > 0) {
            updateValues.push(update.data.id);
            await query(
              `UPDATE game_objects SET ${updateFields.join(', ')} WHERE id = ?`,
              updateValues
            );
          }

          // Add logic blocks if provided
          if (update.data.logic_blocks && Array.isArray(update.data.logic_blocks)) {
            for (const block of update.data.logic_blocks) {
              await query(
                `INSERT INTO logic_blocks 
                 (id, game_object_id, project_id, block_type, category, order_index, block_data)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                  randomUUID(),
                  update.data.id,
                  projectId,
                  block.block_type || block.type || 'action',
                  block.category || 'general',
                  block.order_index || 0,
                  serializeBlockData(block),
                ]
              );
            }
          }

          return NextResponse.json({ success: true });
        }
        break;
    }

    return NextResponse.json({ 
      success: true,
      message: 'Update applied successfully' 
    });
  } catch (error: any) {
    console.error('Error applying update:', error);
    console.error('Error stack:', error.stack);
    console.error('Update that failed:', JSON.stringify(update, null, 2));
    return NextResponse.json(
      { 
        error: error.message || 'Failed to apply update',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        updateFormat: update.scenes ? 'scenes' : update.new_game_object ? 'new_game_object' : update.type || 'unknown'
      },
      { status: 500 }
    );
  }
}

