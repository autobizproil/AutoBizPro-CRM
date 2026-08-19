-- Migration: 2026-08-19
-- Mirrors: database/migrations/2026_08_19_000002_create_password_reset_tokens_table.php
-- Purpose: forgot-password flow — short-lived reset tokens keyed by email.
-- Not tenant-scoped: mirrors AuthController::login's existing global email lookup
-- (users.email is only unique per tenant_id, but login/forgot-password both match
-- on email alone today — a pre-existing quirk, not introduced here).

CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
  `email`      VARCHAR(255) NOT NULL PRIMARY KEY,
  `token`      VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL
);
