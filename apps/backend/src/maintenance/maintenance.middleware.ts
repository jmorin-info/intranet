import { Injectable, NestMiddleware } from "@nestjs/common";
import type { Request, Response, NextFunction } from "express";
import { MaintenanceService } from "./maintenance.service";

/**
 * Bloque toutes les requêtes API quand le mode maintenance est actif, sauf
 * les routes essentielles à la supervision et au toggle du mode lui-même.
 *
 * Réponse :
 *   503 Service Unavailable
 *   { maintenance: true, message, startedAt }
 *
 * Côté frontend, MaintenanceGate intercepte cette réponse et affiche un
 * écran fullscreen.
 */
@Injectable()
export class MaintenanceMiddleware implements NestMiddleware {
  // Routes accessibles même en maintenance (santé + administration du flag)
  private static readonly ALLOWLIST = [
    "/api/v1/health",
    "/api/v1/healthz",
    "/api/v1/maintenance/status",
    "/api/v1/admin/maintenance",
    // Auth pour qu'un admin puisse se connecter et désactiver le flag
    "/api/v1/auth/login",
    "/api/v1/auth/refresh",
    "/api/v1/auth/me",
  ];

  constructor(private readonly maintenance: MaintenanceService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    if (!this.maintenance.isMaintenanceActiveSync()) {
      return next();
    }
    const url = req.originalUrl || req.url || "";
    for (const allowed of MaintenanceMiddleware.ALLOWLIST) {
      if (
        url === allowed ||
        url.startsWith(allowed + "/") ||
        url.startsWith(allowed + "?")
      ) {
        return next();
      }
    }
    const status = this.maintenance.getStatusSync();
    res
      .status(503)
      .set("Retry-After", "30")
      .json({
        maintenance: true,
        message:
          status.message ||
          "Maintenance en cours, merci de réessayer dans quelques instants.",
        startedAt: status.startedAt,
      });
  }
}
