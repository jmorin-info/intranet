import { Module, NestModule, MiddlewareConsumer } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuditModule } from "../audit/audit.module";
import { MaintenanceService } from "./maintenance.service";
import { MaintenanceController } from "./maintenance.controller";
import { MaintenanceMiddleware } from "./maintenance.middleware";

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [MaintenanceController],
  providers: [MaintenanceService, MaintenanceMiddleware],
  exports: [MaintenanceService],
})
export class MaintenanceModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(MaintenanceMiddleware).forRoutes("*");
  }
}
