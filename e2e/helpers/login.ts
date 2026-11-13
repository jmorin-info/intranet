import type { Page } from '@playwright/test';
import { credentialsFor, loginAsRole } from './auth';
export type Role = 'USER' | 'ADMIN' | 'SUPER_ADMIN';
const roles = { USER: 'COLLAB', ADMIN: 'ADMIN', SUPER_ADMIN: 'SUPER_ADMIN' } as const;
export const SUPER_ADMIN_CREDS = {
  get email() { return process.env.E2E_SUPER_ADMIN_EMAIL || ''; },
  get password() { return process.env.E2E_SUPER_ADMIN_PASSWORD || ''; },
};
export const login = (page: Page, role: Role) => loginAsRole(page, roles[role]);
export const credsFor = (role: Role) => credentialsFor(roles[role]);
