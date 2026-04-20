import {
  Controller,
  Get,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SearchService, SearchType } from './search.service';
import { RequestUser } from '../common/interfaces';

@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(
    @Query('q') query: string,
    @Query('type') type: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @CurrentUser() user: RequestUser,
  ) {
    if (!query || query.trim().length === 0) {
      throw new BadRequestException('Search query is required');
    }

    const validTypes: SearchType[] = ['documents', 'news', 'wiki', 'tickets'];
    const searchType: SearchType = validTypes.includes(type as SearchType)
      ? (type as SearchType)
      : 'all';

    return this.searchService.search(query, searchType, {
      page: parseInt(page || '1', 10),
      limit: parseInt(limit || '20', 10),
    }, user);
  }
}
