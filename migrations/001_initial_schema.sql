-- MySQL Schema for Game Engine
-- Converted from PostgreSQL

CREATE DATABASE IF NOT EXISTS gameengine;
USE gameengine;

-- Users table (replaces Supabase auth.users)
CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email)
);

-- Profiles table (extends users)
CREATE TABLE IF NOT EXISTS profiles (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) UNIQUE NOT NULL,
  role ENUM('child', 'parent', 'admin') NOT NULL DEFAULT 'child',
  username VARCHAR(255) UNIQUE,
  display_name VARCHAR(255),
  age INT,
  parent_id CHAR(36),
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  parental_approval BOOLEAN DEFAULT FALSE,
  content_filter_level INT DEFAULT 3,
  can_publish BOOLEAN DEFAULT FALSE,
  can_share BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT valid_age CHECK (age >= 4 AND age <= 18),
  INDEX idx_parent_id (parent_id),
  INDEX idx_role (role)
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id CHAR(36) PRIMARY KEY,
  owner_id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  is_published BOOLEAN DEFAULT FALSE,
  is_template BOOLEAN DEFAULT FALSE,
  visibility ENUM('private', 'shared', 'public') DEFAULT 'private',
  genre VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_played_at TIMESTAMP NULL,
  play_count INT DEFAULT 0,
  like_count INT DEFAULT 0,
  moderation_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  moderation_notes TEXT,
  FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE,
  INDEX idx_owner_id (owner_id),
  INDEX idx_published (is_published)
);

-- Scenes table
CREATE TABLE IF NOT EXISTS scenes (
  id CHAR(36) PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  order_index INT NOT NULL DEFAULT 0,
  background_color VARCHAR(7) DEFAULT '#87CEEB',
  background_image_url TEXT,
  physics_enabled BOOLEAN DEFAULT TRUE,
  gravity_y FLOAT DEFAULT 9.8,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE KEY unique_project_order (project_id, order_index),
  INDEX idx_project_id (project_id)
);

-- Game objects table
CREATE TABLE IF NOT EXISTS game_objects (
  id CHAR(36) PRIMARY KEY,
  scene_id CHAR(36) NOT NULL,
  type VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  position_x FLOAT DEFAULT 0,
  position_y FLOAT DEFAULT 0,
  position_z FLOAT DEFAULT 0,
  rotation FLOAT DEFAULT 0,
  scale_x FLOAT DEFAULT 1,
  scale_y FLOAT DEFAULT 1,
  sprite_url TEXT,
  color VARCHAR(7),
  width FLOAT,
  height FLOAT,
  has_physics BOOLEAN DEFAULT FALSE,
  is_static BOOLEAN DEFAULT FALSE,
  mass FLOAT DEFAULT 1,
  properties JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
  INDEX idx_scene_id (scene_id)
);

-- Logic blocks table
CREATE TABLE IF NOT EXISTS logic_blocks (
  id CHAR(36) PRIMARY KEY,
  game_object_id CHAR(36),
  project_id CHAR(36),
  scene_id CHAR(36),
  block_type VARCHAR(100) NOT NULL,
  category VARCHAR(100) NOT NULL,
  parent_block_id CHAR(36),
  order_index INT DEFAULT 0,
  block_data JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (game_object_id) REFERENCES game_objects(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_block_id) REFERENCES logic_blocks(id) ON DELETE CASCADE,
  INDEX idx_game_object_id (game_object_id),
  INDEX idx_parent_block_id (parent_block_id)
);

-- Assets table
CREATE TABLE IF NOT EXISTS assets (
  id CHAR(36) PRIMARY KEY,
  project_id CHAR(36),
  owner_id CHAR(36) NOT NULL,
  asset_type VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  file_size INT,
  mime_type VARCHAR(100),
  frame_width INT,
  frame_height INT,
  frame_count INT,
  generated_by_ai BOOLEAN DEFAULT FALSE,
  generation_prompt TEXT,
  moderation_status ENUM('pending', 'approved', 'rejected') DEFAULT 'approved',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE,
  INDEX idx_project_id (project_id),
  INDEX idx_owner_id (owner_id)
);

-- AI generations table
CREATE TABLE IF NOT EXISTS ai_generations (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  project_id CHAR(36),
  generation_type VARCHAR(100) NOT NULL,
  prompt TEXT NOT NULL,
  result JSON,
  model_used VARCHAR(100),
  tokens_used INT,
  generation_time_ms INT,
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id)
);

-- Moderation events table
CREATE TABLE IF NOT EXISTS moderation_events (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  content_type VARCHAR(100) NOT NULL,
  content_id CHAR(36),
  content TEXT,
  flagged BOOLEAN DEFAULT FALSE,
  flag_reason TEXT,
  severity VARCHAR(50),
  auto_action_taken VARCHAR(100),
  reviewed BOOLEAN DEFAULT FALSE,
  reviewer_id CHAR(36),
  review_decision VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewer_id) REFERENCES profiles(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id)
);

-- Collaboration sessions table
CREATE TABLE IF NOT EXISTS collaboration_sessions (
  id CHAR(36) PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  session_token VARCHAR(255) UNIQUE NOT NULL,
  cursor_position JSON,
  current_scene_id CHAR(36),
  is_active BOOLEAN DEFAULT TRUE,
  last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (current_scene_id) REFERENCES scenes(id) ON DELETE SET NULL,
  INDEX idx_project_id (project_id)
);

-- Trigger to auto-create profile when user is created
DELIMITER //
DROP TRIGGER IF EXISTS after_user_insert//
CREATE TRIGGER after_user_insert
AFTER INSERT ON users
FOR EACH ROW
BEGIN
  INSERT INTO profiles (id, user_id, role, username, display_name, parental_approval)
  VALUES (
    UUID(),
    NEW.id,
    'child',
    CONCAT('user_', SUBSTRING(NEW.id, 1, 8)),
    CONCAT('user_', SUBSTRING(NEW.id, 1, 8)),
    FALSE
  )
  ON DUPLICATE KEY UPDATE id=id;
END//
DELIMITER ;

