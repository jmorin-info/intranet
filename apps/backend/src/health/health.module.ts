import { Global, Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { HealthController } from "./health.controller";
import { PrismaHealthIndicator } from "./prisma-health.indicator";
import { MetricsService } from "./metrics.service";
import { AppMetricsService } from "./app-metrics.service";
import { PrismaModule } from "../prisma/prisma.module";
import { OfficeModule } from "../office/office.module";
import {
  RedisThrottlerStorage,
  createThrottlerStorageFromEnv,
} from "../common/throttler/redis-throttler.storage";

/**
 * Singleton lazy : le storage Throttler Redis est partagé entre
 * `HealthModule` (ping) et `AppModule` (ThrottlerModule.forRoot). On évite
 * la dépendance circulaire en exposant une *factory* lazy qui retourne
 * la même instance dans les deux modules.
 */
let _sharedStorage: RedisThrottlerStorage | null = null;
export function getSharedThrottlerStorage(): RedisThrottlerStorage {
  if (!_sharedStorage) {
    _sharedStorage = createThrottlerStorageFromEnv();
  }
  return _sharedStorage;
}

/**
 * `@Global()` so AppMetricsService can be injected from any feature module
 * (cache, mfa, documents, ldap…) without re-importing HealthModule.
 */
@Global()
@Module({
  imports: [TerminusModule, PrismaModule, OfficeModule],
  controllers: [HealthController],
  providers: [
    PrismaHealthIndicator,
    MetricsService,
    AppMetricsService,
    {
      // Le HealthController résout `RedisThrottlerStorage` via cette factory.
      // Doit pointer vers la MÊME instance que celle injectée dans
      // ThrottlerModule.forRoot — voir AppModule.throttlerStorage.
      provide: RedisThrottlerStorage,
      useFactory: () => getSharedThrottlerStorage(),
    },
  ],
  exports: [AppMetricsService, RedisThrottlerStorage],
})
export class HealthModule {}
