-- Migration: add property_category, is_new_project, and plot-specific columns
-- Run this on production MySQL after deploying the new code

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS property_category     VARCHAR(20)    NULL,
  ADD COLUMN IF NOT EXISTS is_new_project        BOOLEAN        NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS plot_length           DECIMAL(10,2)  NULL,
  ADD COLUMN IF NOT EXISTS plot_width            DECIMAL(10,2)  NULL,
  ADD COLUMN IF NOT EXISTS plot_area             DECIMAL(10,2)  NULL,
  ADD COLUMN IF NOT EXISTS ownership             VARCHAR(50)    NULL,
  ADD COLUMN IF NOT EXISTS facing_road_width     DECIMAL(10,2)  NULL,
  ADD COLUMN IF NOT EXISTS boundary_wall         VARCHAR(30)    NULL,
  ADD COLUMN IF NOT EXISTS electricity_connection BOOLEAN       NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS water_supply          BOOLEAN        NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sewage_connection     BOOLEAN        NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS floors_allowed        INT            NULL;
