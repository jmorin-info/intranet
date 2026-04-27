import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { WebDAVController } from "./webdav.controller";
import { WebDAVService } from "./webdav.service";

@Module({
  imports: [PrismaModule],
  controllers: [WebDAVController],
  providers: [WebDAVService],
  exports: [WebDAVService],
})
export class WebDAVModule {}
