"use client";

import type { ReactNode } from "react";
import { UserRole } from "@omnitech/shared";
import { RoleGuard } from "@/components/role-guard";

/** Same minimum role as AdminContentController, including nested editors. */
export default function AdminContentLayout({ children }: { children: ReactNode }) {
  return <RoleGuard minRole={UserRole.ADMIN}>{children}</RoleGuard>;
}
