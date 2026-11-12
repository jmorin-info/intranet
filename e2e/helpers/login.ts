import { assertTestEnvironment, testApiUrl, requireTestCredentials } from './test-environment';
import type { Page } from "@playwright/test";
import {
  ADMIN_CREDS,
  COLLAB_CREDS,
  loginAsAdmin,
  loginAsCollaborateur,
} from "./auth";

/**
 * Unified role-based login helper used across the new critical-flow specs
 * (csp-hydration, gdpr-export, mfa-fresh-12h, ticket-calendar-sync,
 * audit-log-creation, rbac-non-admin-blocked).
 *
 * Roles:
 * - 'USER'        → collaborateur (no admin privileges)
 * - 'ADMIN'       → admin account (mapped to SUPER_ADMIN on this preprod)
 * - 'SUPER_ADMIN' → SUPER_ADMIN explicit
 *
 * If a dedicated SUPER_ADMIN credential is required, set
 * `E2E_SUPER_ADMIN_EMAIL` / `E2E_SUPER_ADMIN_PASSWORD`.
 */
export type Role = "USER" | "ADMIN" | "SUPER_ADMIN";

export const SUPER_ADMIN_CREDS = {
  email: process.env.E2E_SUPER_ADMIN_EMAIL || ADMIN_CREDS.email,
  password: process.env.E2E_SUPER_ADMIN_PASSWORD || ADMIN_CREDS.password,
};

export async function login(page: Page, role: Role): Promise<void> {
  switch (role) {
    case "USER":
      await loginAsCollaborateur(page);
      return;
    case "ADMIN":
      await loginAsAdmin(page);
      return;
    case "SUPER_ADMIN": {
      // Force a fresh login if credentials differ from the default admin
      assertTestEnvironment();
      const { email, password } = process.env.E2E_SUPER_ADMIN_EMAIL ? requireTestCredentials('SUPER_ADMIN') : requireTestCredentials('ADMIN');
      const apiBase = testApiUrl();
      const res = await page.request
        .post(`${apiBase}/auth/login`, {
          data: { email, password },
          failOnStatusCode: false,
        })
        .catch(() => null);
      if (res && res.ok()) {
        await page.goto("/dashboard").catch(() => page.goto("/"));
        return;
      }
      // Fallback to UI form
      await page.goto("/login");
      await page.fill('input[type="email"]', email);
      await page.fill('input[type="password"]', password);
      await page.click('button[type="submit"]');
      await page
        .waitForURL("**/dashboard", { timeout: 15_000 })
        .catch(() => undefined);
      return;
    }
  }
}

export function credsFor(role: Role): { email: string; password: string } {
  switch (role) {
    case "USER":
      return COLLAB_CREDS;
    case "ADMIN":
      return ADMIN_CREDS;
    case "SUPER_ADMIN":
      return SUPER_ADMIN_CREDS;
  }
}
