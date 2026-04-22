-- Migration: Add notificationPreferences JSONB column to User
-- Generated: 2026-04-22
-- Context: Permettre aux utilisateurs de configurer leurs préférences de
-- notifications par canal (email / in-app / push) et par catégorie
-- (tickets, documents, incidents, mentions, digest email daily/weekly).
-- Nullable: si NULL → défauts appliqués côté service (tous canaux autorisés,
-- push limité aux catégories mentions + incidents) → pas de breaking change.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notificationPreferences" JSONB;
