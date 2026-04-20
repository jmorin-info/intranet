import { Controller, Get, Put, Body, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { HelpdeskService } from './helpdesk.service';
import { UserRole } from '../common/enums';

@Controller('helpdesk')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HelpdeskController {
  constructor(private readonly helpdeskService: HelpdeskService) {}

  @Get('kb')
  getKnowledgeBase() {
    return this.helpdeskService.getKnowledgeBase();
  }

  @Get('kb/search')
  searchKnowledgeBase(@Query('q') query: string) {
    return this.helpdeskService.searchKnowledgeBase(query || '');
  }

  @Put('kb')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  updateKnowledgeBase(@Body() body: Array<{ keywords: string[]; question: string; answer: string }>) {
    return this.helpdeskService.updateKnowledgeBase(body);
  }
}
