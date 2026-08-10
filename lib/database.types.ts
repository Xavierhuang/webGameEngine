export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = 'child' | 'parent' | 'admin';
export type ModerationStatus = 'pending' | 'approved' | 'rejected';
export type ProjectVisibility = 'private' | 'shared' | 'public';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: UserRole;
          username: string | null;
          display_name: string | null;
          age: number | null;
          parent_id: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
          parental_approval: boolean;
          content_filter_level: number;
          can_publish: boolean;
          can_share: boolean;
        };
        Insert: {
          id: string;
          role?: UserRole;
          username?: string | null;
          display_name?: string | null;
          age?: number | null;
          parent_id?: string | null;
          avatar_url?: string | null;
          parental_approval?: boolean;
          content_filter_level?: number;
          can_publish?: boolean;
          can_share?: boolean;
        };
        Update: {
          id?: string;
          role?: UserRole;
          username?: string | null;
          display_name?: string | null;
          age?: number | null;
          parent_id?: string | null;
          avatar_url?: string | null;
          parental_approval?: boolean;
          content_filter_level?: number;
          can_publish?: boolean;
          can_share?: boolean;
        };
      };
      projects: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          description: string | null;
          thumbnail_url: string | null;
          is_published: boolean;
          is_template: boolean;
          visibility: ProjectVisibility;
          genre: string | null;
          created_at: string;
          updated_at: string;
          last_played_at: string | null;
          play_count: number;
          like_count: number;
          moderation_status: ModerationStatus;
          moderation_notes: string | null;
        };
        Insert: {
          id?: string;
          owner_id: string;
          title: string;
          description?: string | null;
          thumbnail_url?: string | null;
          is_published?: boolean;
          is_template?: boolean;
          visibility?: ProjectVisibility;
          genre?: string | null;
          moderation_status?: ModerationStatus;
        };
        Update: {
          title?: string;
          description?: string | null;
          thumbnail_url?: string | null;
          is_published?: boolean;
          visibility?: ProjectVisibility;
          genre?: string | null;
          moderation_status?: ModerationStatus;
          moderation_notes?: string | null;
        };
      };
      scenes: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          order_index: number;
          background_color: string;
          background_image_url: string | null;
          physics_enabled: boolean;
          gravity_y: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          name: string;
          order_index?: number;
          background_color?: string;
          background_image_url?: string | null;
          physics_enabled?: boolean;
          gravity_y?: number;
        };
        Update: {
          name?: string;
          order_index?: number;
          background_color?: string;
          background_image_url?: string | null;
          physics_enabled?: boolean;
          gravity_y?: number;
        };
      };
      game_objects: {
        Row: {
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
          sprite_url: string | null;
          color: string | null;
          width: number | null;
          height: number | null;
          has_physics: boolean;
          is_static: boolean;
          mass: number;
          properties: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          scene_id: string;
          type: string;
          name: string;
          position_x?: number;
          position_y?: number;
          position_z?: number;
          rotation?: number;
          scale_x?: number;
          scale_y?: number;
          sprite_url?: string | null;
          color?: string | null;
          width?: number | null;
          height?: number | null;
          has_physics?: boolean;
          is_static?: boolean;
          mass?: number;
          properties?: Json;
        };
        Update: {
          type?: string;
          name?: string;
          position_x?: number;
          position_y?: number;
          position_z?: number;
          rotation?: number;
          scale_x?: number;
          scale_y?: number;
          sprite_url?: string | null;
          color?: string | null;
          width?: number | null;
          height?: number | null;
          has_physics?: boolean;
          is_static?: boolean;
          mass?: number;
          properties?: Json;
        };
      };
      logic_blocks: {
        Row: {
          id: string;
          game_object_id: string | null;
          project_id: string | null;
          scene_id: string | null;
          block_type: string;
          category: string;
          parent_block_id: string | null;
          order_index: number;
          block_data: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          game_object_id?: string | null;
          project_id?: string | null;
          scene_id?: string | null;
          block_type: string;
          category: string;
          parent_block_id?: string | null;
          order_index?: number;
          block_data: Json;
        };
        Update: {
          block_type?: string;
          category?: string;
          parent_block_id?: string | null;
          order_index?: number;
          block_data?: Json;
        };
      };
      assets: {
        Row: {
          id: string;
          project_id: string | null;
          owner_id: string;
          asset_type: string;
          name: string;
          file_url: string;
          file_size: number | null;
          mime_type: string | null;
          frame_width: number | null;
          frame_height: number | null;
          frame_count: number | null;
          generated_by_ai: boolean;
          generation_prompt: string | null;
          moderation_status: ModerationStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id?: string | null;
          owner_id: string;
          asset_type: string;
          name: string;
          file_url: string;
          file_size?: number | null;
          mime_type?: string | null;
          frame_width?: number | null;
          frame_height?: number | null;
          frame_count?: number | null;
          generated_by_ai?: boolean;
          generation_prompt?: string | null;
          moderation_status?: ModerationStatus;
        };
        Update: {
          name?: string;
          moderation_status?: ModerationStatus;
        };
      };
      ai_generations: {
        Row: {
          id: string;
          user_id: string;
          project_id: string | null;
          generation_type: string;
          prompt: string;
          result: Json | null;
          model_used: string | null;
          tokens_used: number | null;
          generation_time_ms: number | null;
          success: boolean;
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_id?: string | null;
          generation_type: string;
          prompt: string;
          result?: Json | null;
          model_used?: string | null;
          tokens_used?: number | null;
          generation_time_ms?: number | null;
          success?: boolean;
          error_message?: string | null;
        };
        Update: {
          result?: Json | null;
          success?: boolean;
          error_message?: string | null;
        };
      };
      moderation_events: {
        Row: {
          id: string;
          user_id: string;
          content_type: string;
          content_id: string | null;
          content: string | null;
          flagged: boolean;
          flag_reason: string | null;
          severity: string | null;
          auto_action_taken: string | null;
          reviewed: boolean;
          reviewer_id: string | null;
          review_decision: string | null;
          created_at: string;
          reviewed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          content_type: string;
          content_id?: string | null;
          content?: string | null;
          flagged?: boolean;
          flag_reason?: string | null;
          severity?: string | null;
          auto_action_taken?: string | null;
          reviewed?: boolean;
          reviewer_id?: string | null;
          review_decision?: string | null;
        };
        Update: {
          reviewed?: boolean;
          reviewer_id?: string | null;
          review_decision?: string | null;
          reviewed_at?: string | null;
        };
      };
      collaboration_sessions: {
        Row: {
          id: string;
          project_id: string;
          user_id: string;
          session_token: string;
          cursor_position: Json | null;
          current_scene_id: string | null;
          is_active: boolean;
          last_activity_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          user_id: string;
          session_token: string;
          cursor_position?: Json | null;
          current_scene_id?: string | null;
          is_active?: boolean;
        };
        Update: {
          cursor_position?: Json | null;
          current_scene_id?: string | null;
          is_active?: boolean;
          last_activity_at?: string;
        };
      };
    };
  };
}

