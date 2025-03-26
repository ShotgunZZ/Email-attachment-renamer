-- Add machine_id column to existing paid_users table
ALTER TABLE paid_users ADD COLUMN machine_id TEXT;

-- Create new table for tracking trial usage by machine
CREATE TABLE trial_usage (
  machine_id TEXT NOT NULL,
  usage_date DATE NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (machine_id, usage_date)
); 