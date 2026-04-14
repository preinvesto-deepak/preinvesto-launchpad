-- Migration: add review_status and sold_at columns to existing properties table
-- Run once against your MySQL database before deploying the updated code

ALTER TABLE properties
  ADD COLUMN review_status VARCHAR(15) NOT NULL DEFAULT 'pending' AFTER status,
  ADD COLUMN sold_at TIMESTAMP NULL DEFAULT NULL AFTER review_status;

-- Mark all existing properties as approved (they were already live)
UPDATE properties SET review_status = 'approved' WHERE review_status = 'pending';
