-- Migration: add status column to existing properties table
-- Run once against your MySQL database before deploying the updated code

ALTER TABLE properties
  ADD COLUMN status VARCHAR(15) NOT NULL DEFAULT 'available'
  AFTER prefer_whatsapp;
