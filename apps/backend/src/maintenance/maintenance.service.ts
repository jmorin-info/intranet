import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Mode maintenance — service avec cache local pour éviter une query DB sur
 * chaque requête HTTP. Le cache se rafraîchit toutes les 5 secondes (assez
 * réactif pour un toggle admin, sans flooder la DB).
 *
 * Clés AppConfig (alignées sur l'infrastructure existante de health.controller) :
 *   - maintenance_mode         : "true" | "false"
 *   - maintenance_message      : text libre (raison affichée à l'utilisateur)
 *   - maintenance_return_time  : ISO date / texte (ETA de retour)
 *   - maintenance_started_at   : ISO date (informatif, posé par le toggle ON)
 */
@Injectable()
export class MaintenanceService implements OnModuleInit {
  private readonly logger = new Logger(MaintenanceService.name);
  private static readonly CACHE_TTL_MS = 5_000;

  private cached = {
    enabled: false,
    message: "",
    estimatedReturnTime: "" as string | null,
    startedAt: null as string | null,
    fetchedAt: 0,
  };

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
  }

  isMaintenanceActiveSync(): boolean {
    return this.cached.enabled;
  }

  getStatusSync(): {
    enabled: boolean;
    message: string;
    estimatedReturnTime: string | null;
    startedAt: string | null;
  } {
    return {
      enabled: this.cached.enabled,
      message: this.cached.message,
      estimatedReturnTime: this.cached.estimatedReturnTime,
      startedAt: this.cached.startedAt,
    };
  }

  async getStatus(): Promise<{
    enabled: boolean;
    message: string;
    estimatedReturnTime: string | null;
    startedAt: string | null;
  }> {
    if (Date.now() - this.cached.fetchedAt > MaintenanceService.CACHE_TTL_MS) {
      await this.refresh();
    }
    return this.getStatusSync();
  }

  async refresh(): Promise<void> {
    const rows = await this.prisma.appConfig.findMany({
      where: {
        key: {
          in: [
            "maintenance_mode",
            "maintenance_message",
            "maintenance_return_time",
            "maintenance_started_at",
          ],
        },
      },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const enabledRaw = (map.get("maintenance_mode") || "").trim();
    this.cached = {
      enabled: enabledRaw === "true" || enabledRaw === "1",
      message: map.get("maintenance_message") || "",
      estimatedReturnTime: map.get("maintenance_return_time") || null,
      startedAt: map.get("maintenance_started_at") || null,
      fetchedAt: Date.now(),
    };
  }

  async setEnabled(
    enabled: boolean,
    opts?: { message?: string; estimatedReturnTime?: string },
  ): Promise<{
    enabled: boolean;
    message: string;
    estimatedReturnTime: string | null;
    startedAt: string | null;
  }> {
    await this.upsert("maintenance_mode", enabled ? "true" : "false");
    if (typeof opts?.message === "string") {
      await this.upsert("maintenance_message", opts.message);
    }
    if (typeof opts?.estimatedReturnTime === "string") {
      await this.upsert("maintenance_return_time", opts.estimatedReturnTime);
    }
    if (enabled) {
      await this.upsert("maintenance_started_at", new Date().toISOString());
    } else {
      await this.prisma.appConfig.deleteMany({
        where: {
          key: {
            in: ["maintenance_started_at", "maintenance_return_time"],
          },
        },
      });
    }
    await this.refresh();
    this.logger.warn(
      `Maintenance mode ${enabled ? "ENABLED" : "DISABLED"} (${opts?.message ?? "no message"})`,
    );
    return this.getStatusSync();
  }

  private async upsert(key: string, value: string): Promise<void> {
    await this.prisma.appConfig.upsert({
      where: { key },
      create: { key, value, updatedAt: new Date() },
      update: { value, updatedAt: new Date() },
    });
  }
}
