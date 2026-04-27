import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Query,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../common/interfaces';
import { SavedFiltersService, SavedFilterScope } from './saved-filters.service';
import { CreateSavedFilterDto } from './dto/create-saved-filter.dto';
import { ShareSavedFilterDto, UpdateSavedFilterDto } from './dto/share-saved-filter.dto';

const VALID_SCOPES: ReadonlySet<SavedFilterScope> = new Set(['mine', 'shared', 'all']);

@Controller('saved-filters')
@UseGuards(JwtAuthGuard)
export class SavedFiltersController {
  constructor(private readonly savedFiltersService: SavedFiltersService) {}

  @Get()
  findAll(
    @CurrentUser() user: RequestUser,
    @Query('module') module?: string,
    @Query('scope') scope?: string,
  ) {
    let normalizedScope: SavedFilterScope = 'mine';
    if (scope !== undefined) {
      if (!VALID_SCOPES.has(scope as SavedFilterScope)) {
        throw new BadRequestException("scope must be one of: mine, shared, all");
      }
      normalizedScope = scope as SavedFilterScope;
    }
    return this.savedFiltersService.findAll(user, { module, scope: normalizedScope });
  }

  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Body() body: CreateSavedFilterDto,
  ) {
    return this.savedFiltersService.create(user, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateSavedFilterDto,
  ) {
    return this.savedFiltersService.update(id, user, body);
  }

  @Patch(':id/share')
  share(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ShareSavedFilterDto,
  ) {
    return this.savedFiltersService.share(id, user, body);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.savedFiltersService.remove(id, user);
  }
}
