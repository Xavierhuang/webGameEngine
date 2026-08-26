export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = 'child' | 'parent' | 'admin';
export type ProfileKind = 'user' | 'guest';
export type ModerationStatus = 'pending' | 'approved' | 'rejected';
export type ProjectModerationStatus = 'draft' | 'moderation_pending' | 'published' | 'rejected';
export type PublicationModerationStatus = 'moderation_pending' | 'published' | 'rejected';
export type ProjectVisibility = 'private' | 'shared' | 'public';
export type WorldReleaseStatus =
  | 'submitted' | 'checking' | 'review_pending' | 'published'
  | 'changes_requested' | 'rejected' | 'withdrawn' | 'taken_down' | 'superseded';
export type WorldReleaseCheckStatus = 'passed' | 'failed' | 'error';
export type WorldReleaseDecision = 'approved' | 'changes_requested' | 'rejected' | 'taken_down';
export type WorldReleaseReasonCode =
  | 'automated_check_failed' | 'content_policy' | 'age_safety' | 'copyright'
  | 'duplicate_submission' | 'creator_withdrew' | 'administrative_action';
export type WorldReleaseCheckReasonCode =
  | 'content_policy' | 'age_safety' | 'copyright' | 'snapshot_integrity'
  | 'template_validation' | 'internal_error'
  | 'snapshot_hash_mismatch' | 'snapshot_revision_mismatch'
  | 'template_not_active' | 'template_invalid' | 'template_budget_unavailable'
  | 'budget_exceeded' | 'asset_size_unavailable'
  | 'asset_url_invalid' | 'asset_reference_invalid'
  | 'block_type_unsupported' | 'block_data_invalid'
  | 'scene_missing' | 'player_missing' | 'player_controls_missing'
  | 'metadata_invalid' | 'metadata_moderation_failed' | 'check_error';
export type WorldReleaseDecisionReasonCode =
  | 'approved' | 'changes_requested' | 'content_policy' | 'age_safety'
  | 'copyright' | 'administrative_action';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          user_id: string | null;
          profile_kind: ProfileKind;
          role: UserRole;
          username: string | null;
          display_name: string | null;
          birth_month: string | null;
          /** @deprecated Kept only while legacy application queries are migrated. */
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
          user_id?: string | null;
          profile_kind?: ProfileKind;
          role?: UserRole;
          username?: string | null;
          display_name?: string | null;
          birth_month?: string | null;
          /** @deprecated Kept only while legacy application queries are migrated. */
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
          user_id?: string | null;
          profile_kind?: ProfileKind;
          role?: UserRole;
          username?: string | null;
          display_name?: string | null;
          birth_month?: string | null;
          /** @deprecated Kept only while legacy application queries are migrated. */
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
          moderation_status: ProjectModerationStatus;
          moderation_notes: string | null;
          revision: number;
          source_release_id: string | null;
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
          moderation_status?: ProjectModerationStatus;
          revision?: number;
          source_release_id?: string | null;
        };
        Update: {
          title?: string;
          description?: string | null;
          thumbnail_url?: string | null;
          is_published?: boolean;
          visibility?: ProjectVisibility;
          genre?: string | null;
          moderation_status?: ProjectModerationStatus;
          moderation_notes?: string | null;
          revision?: number;
          source_release_id?: string | null;
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
          lighting_preset: string | null;
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
          lighting_preset?: string | null;
          physics_enabled?: boolean;
          gravity_y?: number;
        };
        Update: {
          name?: string;
          order_index?: number;
          background_color?: string;
          background_image_url?: string | null;
          lighting_preset?: string | null;
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
      guest_sessions: {
        Row: {
          id: string;
          profile_id: string;
          token_hash: string;
          created_at: string;
          last_seen_at: string | null;
          expires_at: string;
          revoked_at: string | null;
        };
        Insert: {
          id: string;
          profile_id: string;
          token_hash: string;
          expires_at: string;
          last_seen_at?: string | null;
          revoked_at?: string | null;
        };
        Update: {
          last_seen_at?: string | null;
          expires_at?: string;
          revoked_at?: string | null;
        };
      };
      legacy_guest_quarantine: {
        Row: {
          id: string;
          legacy_profile_id: string;
          legacy_user_id: string | null;
          reason: 'profile_kind_guest' | 'missing_user' | 'temporary_guest_email';
          quarantined_at: string;
        };
        Insert: {
          id: string;
          legacy_profile_id: string;
          legacy_user_id?: string | null;
          reason: 'profile_kind_guest' | 'missing_user' | 'temporary_guest_email';
        };
        Update: Record<string, never>;
      };
      trust_migration_state: {
        Row: {
          migration_key: string;
          completed_at: string;
        };
        Insert: {
          migration_key: string;
        };
        Update: Record<string, never>;
      };
      consent_tokens: {
        Row: {
          id: string;
          profile_id: string;
          token_hash: string;
          purpose: 'parental_consent' | 'email_verification';
          status: 'pending' | 'granted' | 'denied' | 'expired';
          created_at: string;
          expires_at: string;
          consumed_at: string | null;
        };
        Insert: {
          id: string;
          profile_id: string;
          token_hash: string;
          purpose?: 'parental_consent' | 'email_verification';
          status?: 'pending' | 'granted' | 'denied' | 'expired';
          expires_at: string;
          consumed_at?: string | null;
        };
        Update: {
          status?: 'pending' | 'granted' | 'denied' | 'expired';
          consumed_at?: string | null;
        };
      };
      rate_limit_buckets: {
        Row: {
          bucket_key: string;
          scope: string;
          subject_hash: string;
          window_started_at: string;
          request_count: number;
          active_count: number;
          updated_at: string;
          expires_at: string;
        };
        Insert: {
          bucket_key: string;
          scope: string;
          subject_hash: string;
          window_started_at: string;
          request_count?: number;
          active_count?: number;
          expires_at: string;
        };
        Update: {
          window_started_at?: string;
          request_count?: number;
          active_count?: number;
          expires_at?: string;
        };
      };
      security_audit_events: {
        Row: {
          id: string;
          actor_kind: 'user' | 'guest' | 'anonymous' | 'system';
          actor_id: string | null;
          operation: string;
          outcome: 'allowed' | 'denied' | 'error';
          reason_code: string | null;
          request_id: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          actor_kind: 'user' | 'guest' | 'anonymous' | 'system';
          actor_id?: string | null;
          operation: string;
          outcome: 'allowed' | 'denied' | 'error';
          reason_code?: string | null;
          request_id?: string | null;
        };
        Update: Record<string, never>;
      };
      feature_flags: {
        Row: {
          flag_key: string;
          enabled: boolean;
          updated_at: string;
        };
        Insert: {
          flag_key: string;
          enabled?: boolean;
        };
        Update: {
          enabled?: boolean;
        };
      };
      publication_snapshots: {
        Row: {
          id: string;
          project_id: string;
          snapshot_json: Json;
          content_hash: string;
          moderation_status: PublicationModerationStatus;
          stale_at: string | null;
          created_at: string;
          moderated_at: string | null;
          published_at: string | null;
        };
        Insert: {
          id: string;
          project_id: string;
          snapshot_json: Json;
          content_hash: string;
          moderation_status?: PublicationModerationStatus;
          stale_at?: string | null;
          moderated_at?: string | null;
          published_at?: string | null;
        };
        Update: {
          moderation_status?: PublicationModerationStatus;
          stale_at?: string | null;
          moderated_at?: string | null;
          published_at?: string | null;
        };
      };
      publication_assets: {
        Row: {
          id: string;
          publication_snapshot_id: string;
          asset_id: string | null;
          content_hash: string;
          storage_key: string;
          mime_type: string;
          byte_size: number;
          created_at: string;
        };
        Insert: {
          id: string;
          publication_snapshot_id: string;
          asset_id?: string | null;
          content_hash: string;
          storage_key: string;
          mime_type: string;
          byte_size: number;
        };
        Update: Record<string, never>;
      };
      reports: {
        Row: {
          id: string;
          reporter_profile_id: string | null;
          reported_project_id: string | null;
          world_release_id: string | null;
          reported_profile_id: string | null;
          reason: 'inappropriate' | 'harassment' | 'spam' | 'violence' | 'other';
          details: string | null;
          status: 'open' | 'reviewed' | 'dismissed' | 'actioned' | null;
          reviewer_id: string | null;
          review_notes: string | null;
          created_at: string;
          reviewed_at: string | null;
        };
        Insert: {
          id: string;
          reporter_profile_id?: string | null;
          reported_project_id?: string | null;
          world_release_id?: string | null;
          reported_profile_id?: string | null;
          reason?: 'inappropriate' | 'harassment' | 'spam' | 'violence' | 'other';
          details?: string | null;
          status?: 'open' | 'reviewed' | 'dismissed' | 'actioned' | null;
          reviewer_id?: string | null;
          review_notes?: string | null;
          reviewed_at?: string | null;
        };
        Update: {
          world_release_id?: string | null;
          status?: 'open' | 'reviewed' | 'dismissed' | 'actioned' | null;
          reviewer_id?: string | null;
          review_notes?: string | null;
          reviewed_at?: string | null;
        };
      };
      world_releases: {
        Row: {
          id: string;
          project_id: string;
          project_play_snapshot_id: string;
          template_id: string;
          template_version: number;
          project_revision: number;
          snapshot_sha256: string;
          status: WorldReleaseStatus;
          current_public: boolean;
          public_slug: string | null;
          creator_label: string;
          decision_reason_code: WorldReleaseReasonCode | null;
          submission_idempotency_key: string;
          submitted_at: string;
          checked_at: string | null;
          reviewed_at: string | null;
          published_at: string | null;
          withdrawn_at: string | null;
          taken_down_at: string | null;
        };
        Insert: {
          id: string;
          project_id: string;
          project_play_snapshot_id: string;
          template_id: string;
          template_version: number;
          project_revision: number;
          snapshot_sha256: string;
          status?: WorldReleaseStatus;
          current_public?: boolean;
          public_slug?: string | null;
          creator_label: string;
          decision_reason_code?: WorldReleaseReasonCode | null;
          submission_idempotency_key: string;
          checked_at?: string | null;
          reviewed_at?: string | null;
          published_at?: string | null;
          withdrawn_at?: string | null;
          taken_down_at?: string | null;
        };
        Update: {
          status?: WorldReleaseStatus;
          current_public?: boolean;
          public_slug?: string | null;
          decision_reason_code?: WorldReleaseReasonCode | null;
          checked_at?: string | null;
          reviewed_at?: string | null;
          published_at?: string | null;
          withdrawn_at?: string | null;
          taken_down_at?: string | null;
        };
      };
      world_release_checks: {
        Row: {
          id: string;
          world_release_id: string;
          check_type: string;
          status: WorldReleaseCheckStatus;
          reason_code: WorldReleaseCheckReasonCode | null;
          created_at: string;
        };
        Insert: {
          id: string;
          world_release_id: string;
          check_type: string;
          status: WorldReleaseCheckStatus;
          reason_code?: WorldReleaseCheckReasonCode | null;
        };
        Update: Record<string, never>;
      };
      world_release_decisions: {
        Row: {
          id: string;
          world_release_id: string;
          reviewer_profile_id: string | null;
          decision: WorldReleaseDecision;
          reason_code: WorldReleaseDecisionReasonCode | null;
          decided_at: string;
        };
        Insert: {
          id: string;
          world_release_id: string;
          reviewer_profile_id?: string | null;
          decision: WorldReleaseDecision;
          reason_code?: WorldReleaseDecisionReasonCode | null;
        };
        Update: Record<string, never>;
      };
      world_release_beta_cohort_members: {
        Row: {
          world_release_id: string;
          profile_id: string;
          added_at: string;
        };
        Insert: {
          world_release_id: string;
          profile_id: string;
        };
        Update: Record<string, never>;
      };
      project_commands: {
        Row: {
          id: string;
          project_id: string;
          actor_key: string;
          idempotency_key: string;
          command_type: string;
          command_json: unknown;
          command_sha256: string;
          inverse_json: unknown | null;
          result_json: unknown | null;
          expected_revision: number | null;
          applied_revision: number | null;
          status: 'pending' | 'committed' | 'rolled_back' | 'failed';
          error_message: string | null;
          created_at: string;
          expires_at: string;
        };
        Insert: {
          id: string;
          project_id: string;
          actor_key: string;
          idempotency_key: string;
          command_type: string;
          command_json: unknown;
          command_sha256: string;
          inverse_json?: unknown | null;
          result_json?: unknown | null;
          expected_revision?: number | null;
          applied_revision?: number | null;
          status?: 'pending' | 'committed' | 'rolled_back' | 'failed';
          error_message?: string | null;
          expires_at: string;
        };
        Update: {
          inverse_json?: unknown | null;
          result_json?: unknown | null;
          applied_revision?: number | null;
          status?: 'pending' | 'committed' | 'rolled_back' | 'failed';
          error_message?: string | null;
        };
      };
      editing_sessions: {
        Row: {
          id: string;
          project_id: string;
          actor_key: string;
          undo_group_id: string;
          command_ids: string[];
          description: string | null;
          created_at: string;
          expires_at: string;
        };
        Insert: {
          id: string;
          project_id: string;
          actor_key: string;
          undo_group_id: string;
          command_ids: string[];
          description?: string | null;
          expires_at: string;
        };
        Update: Record<string, never>;
      };
      project_play_snapshots: {
        Row: {
          id: string;
          project_id: string;
          revision: number;
          snapshot_json: unknown;
          snapshot_sha256: string;
          created_at: string;
        };
        Insert: {
          id: string;
          project_id: string;
          revision: number;
          snapshot_json: unknown;
          snapshot_sha256: string;
        };
        Update: Record<string, never>;
      };
      guest_claims: {
        Row: {
          id: string;
          guest_profile_id: string;
          claimed_by_user_id: string;
          claim_token_hash: string;
          status: 'pending' | 'claimed' | 'revoked' | 'expired';
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id: string;
          guest_profile_id: string;
          claimed_by_user_id: string;
          claim_token_hash: string;
          status?: 'pending' | 'claimed' | 'revoked' | 'expired';
        };
        Update: {
          status?: 'pending' | 'claimed' | 'revoked' | 'expired';
          completed_at?: string | null;
        };
      };
      asset_blobs: {
        Row: {
          checksum: string;
          storage_key: string;
          byte_size: number;
          content_type: string;
          refcount: number;
          created_at: string;
        };
        Insert: {
          checksum: string;
          storage_key: string;
          byte_size: number;
          content_type: string;
          refcount?: number;
        };
        Update: {
          refcount?: number;
        };
      };
      storage_repair_jobs: {
        Row: {
          id: string;
          job_type: 'refcount_audit' | 'orphan_sweep' | 'checksum_verify';
          target_checksum: string | null;
          status: 'pending' | 'in_progress' | 'completed' | 'failed';
          attempt_count: number;
          next_attempt_at: string;
          last_error: string | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id: string;
          job_type: 'refcount_audit' | 'orphan_sweep' | 'checksum_verify';
          target_checksum?: string | null;
          status?: 'pending' | 'in_progress' | 'completed' | 'failed';
          attempt_count?: number;
          next_attempt_at: string;
        };
        Update: {
          status?: 'pending' | 'in_progress' | 'completed' | 'failed';
          attempt_count?: number;
          next_attempt_at?: string;
          last_error?: string | null;
          completed_at?: string | null;
        };
      };
      deletion_jobs: {
        Row: {
          id: string;
          subject_type: 'project' | 'account';
          subject_id: string;
          requested_by: string;
          status: 'pending' | 'capturing' | 'purging' | 'completed' | 'failed' | 'cancelled';
          captured_blob_keys: string[] | null;
          error_message: string | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id: string;
          subject_type: 'project' | 'account';
          subject_id: string;
          requested_by: string;
          status?: 'pending' | 'capturing' | 'purging' | 'completed' | 'failed' | 'cancelled';
        };
        Update: {
          status?: 'pending' | 'capturing' | 'purging' | 'completed' | 'failed' | 'cancelled';
          captured_blob_keys?: string[] | null;
          error_message?: string | null;
          completed_at?: string | null;
        };
      };
      backup_runs: {
        Row: {
          id: string;
          retention_class: 'daily' | 'monthly' | 'manual';
          backup_key_id: string;
          storage_key: string;
          archive_sha256: string;
          byte_size: number;
          status: 'running' | 'succeeded' | 'failed';
          started_at: string;
          completed_at: string | null;
          verified_at: string | null;
          error_message: string | null;
        };
        Insert: {
          id: string;
          retention_class: 'daily' | 'monthly' | 'manual';
          backup_key_id: string;
          storage_key: string;
          archive_sha256: string;
          byte_size: number;
          status?: 'running' | 'succeeded' | 'failed';
        };
        Update: {
          status?: 'running' | 'succeeded' | 'failed';
          completed_at?: string | null;
          verified_at?: string | null;
          error_message?: string | null;
        };
      };
    };
  };
}
