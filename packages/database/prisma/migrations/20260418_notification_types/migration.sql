-- Migration: Add TICKET_UPDATED and TICKET_SLA_BREACH to NotificationType enum
-- Generated: 2026-04-18
-- Context: fixes #3 (notification type correction) from iteration #1

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TICKET_UPDATED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TICKET_SLA_BREACH';
