import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BannerService } from './banner.service';
import { RequestUser } from '../common/interfaces';
import { UserRole } from '../common/enums';
import { CreateBannerDto } from './dto/create-banner.dto';

@Controller('banners')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BannerController {
  constructor(private readonly bannerService: BannerService) {}

  /** GET /banners — active banners for all authenticated users */
  @Get()
  getActiveBanners() {
    return this.bannerService.getActiveBanners();
  }

  /** GET /banners/all — all banners (admin) */
  @Get('all')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  findAll() {
    return this.bannerService.findAll();
  }

  /** POST /banners — create banner (ADMIN+) */
  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DIRECTION)
  create(
    @Body() body: CreateBannerDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.bannerService.create({ ...body, authorId: user.id });
  }

  /** PATCH /banners/:id — update banner (ADMIN+) */
  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DIRECTION)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Partial<{ title: string; message: string; level: string; isActive: boolean; expiresAt: string | null }>,
  ) {
    return this.bannerService.update(id, body);
  }

  /** DELETE /banners/:id — delete banner (ADMIN+) */
  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.bannerService.remove(id);
  }
}
