-- Migration 007: upload versioning support
-- Adds superseded_by column to track which upload replaced a previous one.
-- Safe to run multiple times (ADD COLUMN IF NOT EXISTS).

SET search_path TO finanzas;

ALTER TABLE uploaded_files
  ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES uploaded_files(id);
