import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  ForbiddenException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SignaturesService } from './signatures.service';
import { CreateSignatureDto } from './dto/create-signature.dto';
import { RequestUser } from '../common/interfaces';
import { UserRole } from '../common/enums';

@Controller('signatures')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SignaturesController {
  constructor(private readonly signaturesService: SignaturesService) {}

  @Get('templates')
  @Roles(UserRole.ADMIN, UserRole.REVIEWER, UserRole.DIRECTION, UserRole.SUPER_ADMIN)
  listTemplates() {
    return this.signaturesService.listTemplates();
  }

  @Get('submissions')
  @Roles(UserRole.ADMIN, UserRole.REVIEWER, UserRole.DIRECTION, UserRole.SUPER_ADMIN)
  listSubmissions() {
    return this.signaturesService.listSubmissions();
  }

  @Get('submissions/:submissionId')
  @Roles(UserRole.ADMIN, UserRole.REVIEWER, UserRole.DIRECTION, UserRole.SUPER_ADMIN)
  getSubmission(@Param('submissionId') submissionId: string) {
    return this.signaturesService.getSubmission(submissionId);
  }

  @Get('all')
  @Roles(UserRole.ADMIN, UserRole.DIRECTION, UserRole.SUPER_ADMIN)
  listAllSignatureRequests() {
    return this.signaturesService.listAllSignatureRequests();
  }

  @Post('request')
  @Roles(UserRole.ADMIN, UserRole.REVIEWER, UserRole.DIRECTION, UserRole.SUPER_ADMIN)
  createRequest(
    @Body() dto: CreateSignatureDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.signaturesService.createSignatureRequest(
      dto.documentVersionId,
      dto.signerId,
      user.id,
      dto.templateId,
    );
  }

  @Get('my')
  getMySignatures(@CurrentUser() user: RequestUser) {
    return this.signaturesService.getMySignatures(user.id);
  }

  @Patch(':id/sign')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async signDirectly(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    // Verify the user is the signer
    const sig = await this.signaturesService.getStatus(id);
    if (sig.signerId !== user.id) {
      throw new ForbiddenException('Seul le signataire désigné peut signer');
    }
    return this.signaturesService.signDirectly(id, user.id);
  }

  @Get(':id')
  @Roles(UserRole.COLLABORATEUR)
  getStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.signaturesService.getStatus(id);
  }

  @Get('document/:documentId')
  @Roles(UserRole.COLLABORATEUR)
  getByDocument(@Param('documentId', ParseUUIDPipe) documentId: string) {
    return this.signaturesService.getByDocument(documentId);
  }
}
