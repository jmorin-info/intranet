import {
  Controller,
  Get,
  Put,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AppConfigService } from './config.service';
import { UserRole } from '../common/enums';
import { RequestUser } from '../common/interfaces';

const SENSITIVE_SUFFIXES = ['_token', '_secret', '_password', '_key'];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

function maskValue(value: string): string {
  if (value.length <= 4) return '****';
  return '****' + value.slice(-4);
}

@Controller('config')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppConfigController {
  constructor(private readonly configService: AppConfigService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  async findAll() {
    const data = await this.configService.findAll();
    const masked = data.map((item) => ({
      ...item,
      value: isSensitiveKey(item.key) ? maskValue(item.value) : item.value,
    }));
    return { data: masked };
  }

  @Put(':key')
  @Roles(UserRole.SUPER_ADMIN)
  async upsertByKey(
    @Param('key') key: string,
    @Body('value') value: string,
    @Body('description') description: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.configService.upsert(key, value, description, user.id);
  }

  // ----- Wiki categories (ADMIN-accessible) — must come before /:key -----

  @Get('wiki/categories')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getWikiCategories() {
    return this.configService.findByKey('wiki_categories');
  }

  @Post('wiki/categories')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async upsertWikiCategories(
    @Body() body: { value: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.configService.upsert('wiki_categories', body.value, 'Custom wiki categories managed by admins', user.id);
  }

  @Get(':key')
  @Roles(UserRole.SUPER_ADMIN)
  async findByKey(@Param('key') key: string) {
    const item = await this.configService.findByKey(key);
    if (item && isSensitiveKey(item.key)) {
      return { ...item, value: maskValue(item.value) };
    }
    return item;
  }

  @Patch(':key')
  @Roles(UserRole.SUPER_ADMIN)
  async update(
    @Param('key') key: string,
    @Body('value') value: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.configService.upsert(key, value, undefined, user.id);
  }

  @Post('test-smtp')
  @Roles(UserRole.SUPER_ADMIN)
  async testSmtp(@CurrentUser() user: RequestUser) {
    // Send a test email to the current user
    const nodemailer = await import('nodemailer');
    const smtpHost = process.env.SMTP_HOST;
    if (!smtpHost || smtpHost === 'localhost') {
      return { success: false, message: 'SMTP non configuré (host=localhost)' };
    }
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
      });
      await transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@omnitech-security.fr',
        to: user.email,
        subject: '[OMNITECH] Test SMTP',
        text: 'Ce message confirme que la configuration SMTP fonctionne correctement.',
      });
      return { success: true, message: `Email de test envoyé à ${user.email}` };
    } catch (err: any) {
      return { success: false, message: `Erreur SMTP : ${err.message}` };
    }
  }
}
