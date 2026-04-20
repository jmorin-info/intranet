import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { FileserverController } from './fileserver.controller';
import { FileserverService } from './fileserver.service';
import { EphemeralSessionService } from './ephemeral-session.service';
import { SmbOfficeController } from './smb-office.controller';
import { OfficeModule } from '../office/office.module';

@Module({
  imports: [
    OfficeModule,
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET,
    }),
  ],
  controllers: [FileserverController, SmbOfficeController],
  providers: [FileserverService, EphemeralSessionService],
})
export class FileserverModule {}
