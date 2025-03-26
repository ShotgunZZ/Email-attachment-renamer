-- This SQL query adds a unique constraint to the email column in the paid_users table
ALTER TABLE paid_users ADD CONSTRAINT unique_email UNIQUE (email);
