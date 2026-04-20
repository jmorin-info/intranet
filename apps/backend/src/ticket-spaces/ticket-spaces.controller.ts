import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../common/interfaces';
import { TicketSpacesService } from './ticket-spaces.service';
import { CreateSpaceDto, UpdateSpaceDto } from './dto/create-space.dto';
import { AddMemberDto, UpdateMemberDto } from './dto/member.dto';

/**
 * REST controller for ticket workspaces.
 *
 * Routes layout (prefix /ticket-spaces) :
 *  - GET    /           list spaces accessible by the user
 *  - POST   /           admin only — create a space (creator becomes MANAGER)
 *  - GET    /:id        detail + members (requires at least VIEWER)
 *  - PATCH  /:id        manager+ — update space config
 *  - DELETE /:id        admin only — delete + reassign tickets to default
 *  - POST   /:id/members         manager+ — add member
 *  - PATCH  /:id/members/:mid    manager+ — change permission
 *  - DELETE /:id/members/:mid    manager+ — remove member (refuse if last manager)
 */
@Controller('ticket-spaces')
@UseGuards(JwtAuthGuard)
export class TicketSpacesController {
  constructor(private readonly service: TicketSpacesService) {}

  @Get()
  async list(@CurrentUser() user: RequestUser) {
    return this.service.listForUser(user);
  }

  @Post()
  async create(@Body() dto: CreateSpaceDto, @CurrentUser() user: RequestUser) {
    return this.service.create(user, dto);
  }

  @Get(':id')
  async getOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.service.getById(id, user);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSpaceDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.service.delete(user, id);
  }

  // ------- Members -------

  @Post(':id/members')
  async addMember(
    @Param('id', ParseUUIDPipe) spaceId: string,
    @Body() dto: AddMemberDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.addMember(user, spaceId, dto);
  }

  @Patch(':id/members/:memberId')
  async updateMember(
    @Param('id', ParseUUIDPipe) spaceId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: UpdateMemberDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.updateMember(user, spaceId, memberId, dto);
  }

  @Delete(':id/members/:memberId')
  @HttpCode(204)
  async removeMember(
    @Param('id', ParseUUIDPipe) spaceId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.removeMember(user, spaceId, memberId);
  }
}
