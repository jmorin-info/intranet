import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { IsoControlsService } from './iso-controls.service';

@Controller('iso-controls')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IsoControlsController {
  constructor(private readonly isoControlsService: IsoControlsService) {}

  @Get()
  findAll(@Query('domain') domain?: string) {
    return this.isoControlsService.findAll(domain);
  }

  @Get('domains')
  getDomains() {
    return this.isoControlsService.getDomains();
  }

  @Get(':id')
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.isoControlsService.findById(id);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  create(@Body() body: { code: string; title: string; domain: string; description?: string }) {
    return this.isoControlsService.create(body);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: { title?: string; domain?: string; description?: string }) {
    return this.isoControlsService.update(id, body);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.isoControlsService.remove(id);
  }
}
