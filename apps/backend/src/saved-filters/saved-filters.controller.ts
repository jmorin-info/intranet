import { Controller, Get, Post, Patch, Delete, Query, Param, Body, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../common/interfaces';
import { SavedFiltersService } from './saved-filters.service';
import { CreateSavedFilterDto } from './dto/create-saved-filter.dto';

@Controller('saved-filters')
@UseGuards(JwtAuthGuard)
export class SavedFiltersController {
  constructor(private readonly savedFiltersService: SavedFiltersService) {}

  @Get()
  findAll(
    @CurrentUser() user: RequestUser,
    @Query('module') module?: string,
  ) {
    return this.savedFiltersService.findAll(user.id, module);
  }

  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Body() body: CreateSavedFilterDto,
  ) {
    return this.savedFiltersService.create(user.id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { name?: string; isDefault?: boolean },
  ) {
    return this.savedFiltersService.update(id, user.id, body);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.savedFiltersService.remove(id, user.id);
  }
}
