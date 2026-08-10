-- Enable necessary extensions (gen_random_uuid() is built-in in PostgreSQL 13+)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; -- Not needed for PostgreSQL 13+

-- User roles enum
CREATE TYPE user_role AS ENUM ('child', 'parent', 'admin');

-- User type (extends Supabase auth.users)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  role user_role NOT NULL DEFAULT 'child',
  username TEXT UNIQUE,
  display_name TEXT,
  age INTEGER,
  parent_id UUID REFERENCES public.profiles(id),
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Safety fields
  parental_approval BOOLEAN DEFAULT FALSE,
  content_filter_level INTEGER DEFAULT 3, -- 1-5, 5 being strictest
  can_publish BOOLEAN DEFAULT FALSE,
  can_share BOOLEAN DEFAULT FALSE,
  
  CONSTRAINT valid_age CHECK (age >= 4 AND age <= 18),
  CONSTRAINT child_has_parent CHECK (
    (role = 'child' AND parent_id IS NOT NULL) OR 
    (role != 'child')
  )
);

-- Projects table
CREATE TABLE public.projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  is_published BOOLEAN DEFAULT FALSE,
  is_template BOOLEAN DEFAULT FALSE,
  visibility TEXT DEFAULT 'private', -- private, shared, public
  genre TEXT, -- platformer, puzzle, adventure, etc.
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_played_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  play_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  
  -- Safety
  moderation_status TEXT DEFAULT 'pending', -- pending, approved, rejected
  moderation_notes TEXT
);

-- Scenes table (levels within a project)
CREATE TABLE public.scenes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  background_color TEXT DEFAULT '#87CEEB',
  background_image_url TEXT,
  physics_enabled BOOLEAN DEFAULT TRUE,
  gravity_y FLOAT DEFAULT 9.8,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(project_id, order_index)
);

-- Game objects (sprites, characters, items in scenes)
CREATE TABLE public.game_objects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scene_id UUID REFERENCES public.scenes(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL, -- sprite, character, platform, collectible, etc.
  name TEXT NOT NULL,
  
  -- Position and transform
  position_x FLOAT DEFAULT 0,
  position_y FLOAT DEFAULT 0,
  position_z FLOAT DEFAULT 0,
  rotation FLOAT DEFAULT 0,
  scale_x FLOAT DEFAULT 1,
  scale_y FLOAT DEFAULT 1,
  
  -- Visual properties
  sprite_url TEXT,
  color TEXT,
  width FLOAT,
  height FLOAT,
  
  -- Physics
  has_physics BOOLEAN DEFAULT FALSE,
  is_static BOOLEAN DEFAULT FALSE,
  mass FLOAT DEFAULT 1,
  
  -- Custom properties (JSON)
  properties JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Logic blocks (visual programming)
CREATE TABLE public.logic_blocks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_object_id UUID REFERENCES public.game_objects(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  scene_id UUID REFERENCES public.scenes(id) ON DELETE CASCADE,
  
  block_type TEXT NOT NULL, -- event, condition, action, variable
  category TEXT NOT NULL, -- input, movement, logic, sound, etc.
  
  -- Block structure
  parent_block_id UUID REFERENCES public.logic_blocks(id) ON DELETE CASCADE,
  order_index INTEGER DEFAULT 0,
  
  -- Block data
  block_data JSONB NOT NULL, -- parameters, connections, etc.
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Assets (uploaded or generated)
CREATE TABLE public.assets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  
  asset_type TEXT NOT NULL, -- image, audio, sprite_sheet
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  
  -- For sprite sheets
  frame_width INTEGER,
  frame_height INTEGER,
  frame_count INTEGER,
  
  -- Generation metadata
  generated_by_ai BOOLEAN DEFAULT FALSE,
  generation_prompt TEXT,
  
  -- Safety
  moderation_status TEXT DEFAULT 'approved',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI generation history
CREATE TABLE public.ai_generations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  
  generation_type TEXT NOT NULL, -- logic, image, audio, full_game
  prompt TEXT NOT NULL,
  result JSONB,
  
  -- AI metadata
  model_used TEXT,
  tokens_used INTEGER,
  generation_time_ms INTEGER,
  
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Moderation events
CREATE TABLE public.moderation_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  content_type TEXT NOT NULL, -- text, image, project
  content_id UUID,
  content TEXT,
  
  flagged BOOLEAN DEFAULT FALSE,
  flag_reason TEXT,
  severity TEXT, -- low, medium, high, critical
  
  auto_action_taken TEXT, -- none, hidden, blocked, flagged_for_review
  reviewed BOOLEAN DEFAULT FALSE,
  reviewer_id UUID REFERENCES public.profiles(id),
  review_decision TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reviewed_at TIMESTAMP WITH TIME ZONE
);

-- Collaboration sessions (realtime)
CREATE TABLE public.collaboration_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  
  session_token TEXT UNIQUE NOT NULL,
  cursor_position JSONB,
  current_scene_id UUID REFERENCES public.scenes(id),
  
  is_active BOOLEAN DEFAULT TRUE,
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_profiles_parent_id ON public.profiles(parent_id);
CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_projects_owner_id ON public.projects(owner_id);
CREATE INDEX idx_projects_published ON public.projects(is_published);
CREATE INDEX idx_scenes_project_id ON public.scenes(project_id);
CREATE INDEX idx_game_objects_scene_id ON public.game_objects(scene_id);
CREATE INDEX idx_logic_blocks_game_object_id ON public.logic_blocks(game_object_id);
CREATE INDEX idx_logic_blocks_parent_block_id ON public.logic_blocks(parent_block_id);
CREATE INDEX idx_assets_project_id ON public.assets(project_id);
CREATE INDEX idx_assets_owner_id ON public.assets(owner_id);
CREATE INDEX idx_ai_generations_user_id ON public.ai_generations(user_id);
CREATE INDEX idx_moderation_events_user_id ON public.moderation_events(user_id);
CREATE INDEX idx_collaboration_sessions_project_id ON public.collaboration_sessions(project_id);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logic_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collaboration_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Parents can view their children's profiles"
  ON public.profiles FOR SELECT
  USING (auth.uid() = parent_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- RLS Policies for projects
CREATE POLICY "Users can view their own projects"
  ON public.projects FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can view public projects"
  ON public.projects FOR SELECT
  USING (visibility = 'public' AND is_published = TRUE);

CREATE POLICY "Users can create projects"
  ON public.projects FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own projects"
  ON public.projects FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own projects"
  ON public.projects FOR DELETE
  USING (auth.uid() = owner_id);

-- RLS Policies for scenes
CREATE POLICY "Users can manage scenes in their projects"
  ON public.scenes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = scenes.project_id
      AND projects.owner_id = auth.uid()
    )
  );

-- RLS Policies for game objects
CREATE POLICY "Users can manage game objects in their scenes"
  ON public.game_objects FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.scenes
      JOIN public.projects ON projects.id = scenes.project_id
      WHERE scenes.id = game_objects.scene_id
      AND projects.owner_id = auth.uid()
    )
  );

-- RLS Policies for logic blocks
CREATE POLICY "Users can manage logic blocks in their projects"
  ON public.logic_blocks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = logic_blocks.project_id
      AND projects.owner_id = auth.uid()
    )
  );

-- RLS Policies for assets
CREATE POLICY "Users can view their own assets"
  ON public.assets FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can create assets"
  ON public.assets FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- Functions for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scenes_updated_at BEFORE UPDATE ON public.scenes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_game_objects_updated_at BEFORE UPDATE ON public.game_objects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_logic_blocks_updated_at BEFORE UPDATE ON public.logic_blocks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

