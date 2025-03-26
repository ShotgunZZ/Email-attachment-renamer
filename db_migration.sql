-- Add unique constraint to email column in paid_users table
ALTER TABLE paid_users ADD CONSTRAINT unique_email UNIQUE (email);

-- Add machine_id column to existing paid_users table and make it the primary identifier
ALTER TABLE paid_users ADD COLUMN machine_id TEXT;

-- Drop user_id column if it exists (optional, only run if needed)
-- ALTER TABLE paid_users DROP COLUMN user_id;

-- Create new table for tracking trial usage by machine
CREATE TABLE trial_usage (
  machine_id TEXT NOT NULL,
  usage_date DATE NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (machine_id, usage_date)
); 