import { Global, Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { HealthController } from "./health.controller";
import { PrismaHealthIndicator } from "./prisma-health.indicator";
import { MetricsService } from "./metrics.service";
import { AppMetricsService } from "./app-metrics.service";
import { PrismaModule } from "../prisma/prisma.module";
import { OfficeModule } from "../office/office.module";

/**
 * `@Global()` so AppMetricsService can be injected from any feature module
 * (cache, mfa, documents, ldap…) without re-importing HealthModule.
 */
@Global()
@Module({
  imports: [TerminusModule, PrismaModule, OfficeModule],
  controllers: [HealthController],
  providers: [PrismaHealthIndicator, MetricsService, AppMetricsService],
  exports: [AppMetricsService],
})
export class HealthModule {}
