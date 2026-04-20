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
import { ExternalPersonsService } from './external-persons.service';
import { CreateExternalPersonDto } from './dto/create-external-person.dto';
import { UpdateExternalPersonDto } from './dto/update-external-person.dto';
import { UserRole } from '../common/enums';

@Controller('external-persons')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class ExternalPersonsController {
  constructor(
    private readonly externalPersonsService: ExternalPersonsService,
  ) {}

  @Get()
  findAll(@Query('search') search?: string) {
    return this.externalPersonsService.findAll(search);
  }

  @Post()
  create(@Body() dto: CreateExternalPersonDto) {
    return this.externalPersonsService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExternalPersonDto,
  ) {
    return this.externalPersonsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.externalPersonsService.remove(id);
  }
}
