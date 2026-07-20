-- Migration: Add 'plans' permission column to users table
-- Run this once on the existing database before deploying the new code.

ALTER TABLE users ADD COLUMN IF NOT EXISTS plans VARCHAR(20) DEFAULT 'NO_ACCESS';
