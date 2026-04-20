import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { CsvImportController } from './import/csv-import.controller';
import { CsvImportService } from './import/csv-import.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  // CsvImportController déclare des routes statiques sous /users (`import/template`,
  // `import/validate`, `import/execute`). Il DOIT être enregistré avant UsersController
  // qui expose @Get(':id') avec ParseUUIDPipe — sinon les routes statiques sont
  // capturées par `:id` et renvoient 400.
  controllers: [CsvImportController, UsersController],
  providers: [UsersService, CsvImportService],
  exports: [UsersService],
})
export class UsersModule {}
