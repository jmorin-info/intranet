-- =============================================================================
-- Migration: 20260409_ticket_tags
-- Add tags (labels) array field to Ticket model
-- =============================================================================

-- AlterTable: add tags column to Ticket (PostgreSQL array with empty default)
ALTER TABLE "Ticket" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
