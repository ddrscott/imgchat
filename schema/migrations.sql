-- imgchat Database Schema
-- Chat sessions with image generation history

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Untitled',
  settings TEXT NOT NULL DEFAULT '{}',
  current_x_url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, updated_at DESC);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  image_path TEXT,
  x_url TEXT,
  is_edit INTEGER DEFAULT 0,
  generation_time_ms INTEGER,
  archived INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);

-- Migration: Add archived column to messages if it doesn't exist
-- SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so this may error on re-run
-- ALTER TABLE messages ADD COLUMN archived INTEGER DEFAULT 0;

-- Migration: Add archived column to sessions for archiving entire conversations
-- ALTER TABLE sessions ADD COLUMN archived INTEGER DEFAULT 0;

-- User preferences table for storing API keys and settings
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY,
  api_key TEXT,
  default_model TEXT DEFAULT 'flux2klein',
  default_width INTEGER DEFAULT 1024,
  default_height INTEGER DEFAULT 1024,
  default_steps INTEGER DEFAULT 4,
  default_guidance REAL DEFAULT 1.0,
  negative_prompt TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Generation jobs table for persistent job tracking
-- Allows recovery of pending generations after page refresh
CREATE TABLE IF NOT EXISTS generation_jobs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  model TEXT NOT NULL,
  provider TEXT NOT NULL, -- cloudflare, radio
  prompt TEXT NOT NULL,
  params TEXT NOT NULL, -- JSON: {width, height, steps, guidance, negativePrompt, images}
  error_message TEXT,
  attempts INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_jobs_user_status ON generation_jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_session ON generation_jobs(session_id);

-- Migration: Add status and provider columns to messages for tracking
-- ALTER TABLE messages ADD COLUMN status TEXT DEFAULT 'completed';
-- ALTER TABLE messages ADD COLUMN provider TEXT;
-- ALTER TABLE messages ADD COLUMN error_message TEXT;
