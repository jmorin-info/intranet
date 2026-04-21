import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../common/interfaces';
import { TestimonialsService } from './testimonials.service';
import { RejectTestimonialDto, SubmitTestimonialDto } from './dto/submit.dto';

@Controller('testimonials')
export class TestimonialsController {
  constructor(private readonly service: TestimonialsService) {}

  // Endpoint public — appelé par /welcome (page non authentifiée).
  // Retourne { visible, count, items } : items vide si <3 approuvés,
  // pour que le frontend masque la section plutôt que d'afficher 1 citation
  // isolée qui paraîtrait bricolée.
  @Public()
  @Get('approved')
  listApproved() {
    return this.service.listApproved();
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  submit(@CurrentUser() user: RequestUser, @Body() dto: SubmitTestimonialDto) {
    return this.service.submit(user, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('mine')
  listMine(@CurrentUser() user: RequestUser) {
    return this.service.listMine(user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('pending')
  listPending(@CurrentUser() user: RequestUser) {
    return this.service.listPending(user);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  listAll(@CurrentUser() user: RequestUser) {
    return this.service.listAll(user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/approve')
  approve(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.approve(user, id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/reject')
  reject(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectTestimonialDto,
  ) {
    return this.service.reject(user, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(user, id);
  }
}
