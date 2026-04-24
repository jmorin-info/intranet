import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { buildPinoConfig } from './common/logging/pino.config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DepartmentsModule } from './departments/departments.module';
import { DocumentsModule } from './documents/documents.module';
import { SignaturesModule } from './signatures/signatures.module';
import { IsoControlsModule } from './iso-controls/iso-controls.module';
import { NewsModule } from './news/news.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuditModule } from './audit/audit.module';
import { SearchModule } from './search/search.module';
import { StorageModule } from './storage/storage.module';
import { ReportsModule } from './reports/reports.module';
import { HealthModule } from './health/health.module';
import { JobsModule } from './jobs/jobs.module';
import { AppConfigModule } from './config/config.module';
import { IsoAnalyzerModule } from './iso-analyzer/iso-analyzer.module';
import { LdapModule } from './ldap/ldap.module';
import { TicketsModule } from './tickets/tickets.module';
import { VeilleModule } from './veille/veille.module';
import { SatisfactionModule } from './satisfaction/satisfaction.module';
import { PublicModule } from './public/public.module';
import { MfaModule } from './mfa/mfa.module';
import { ChartesModule } from './chartes/chartes.module';
import { AlertsModule } from './alerts/alerts.module';
import { ScannerModule } from './scanner/scanner.module';
import { RunbooksModule } from './runbooks/runbooks.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { ExternalAccessModule } from './external-access/external-access.module';
import { HelpdeskModule } from './helpdesk/helpdesk.module';
import { QuizModule } from './quiz/quiz.module';
import { FileserverModule } from './fileserver/fileserver.module';
import { AdAuditModule } from './ad-audit/ad-audit.module';
import { FrameworksModule } from './frameworks/frameworks.module';
import { TipsModule } from './tips/tips.module';
import { WikiModule } from './wiki/wiki.module';
import { BannerModule } from './banners/banner.module';
import { AiModule } from './ai/ai.module';
import { ComplianceTasksModule } from './compliance-tasks/compliance-tasks.module';
import { AccessReviewsModule } from './access-reviews/access-reviews.module';
import { CacheModule } from './common/cache/cache.module';
import { PushNotificationsModule } from './push-notifications/push-notifications.module';
import { DataRetentionModule } from './data-retention/data-retention.module';
import { ItExportsModule } from './it-exports/it-exports.module';
import { SpacesModule } from './spaces/spaces.module';
import { StirlingModule } from './stirling/stirling.module';
import { IncidentsModule } from './incidents/incidents.module';
import { OfficeModule } from './office/office.module';
import { CalendarModule } from './calendar/calendar.module';
import { SavedFiltersModule } from './saved-filters/saved-filters.module';
import { KioskModule } from './kiosk/kiosk.module';
import { ExportsModule } from './exports/exports.module';
import { MentionsModule } from './mentions/mentions.module';
import { SmsModule } from './sms/sms.module';
import { MeilisearchModule } from './search/meilisearch.module';
import { RssiDashboardModule } from './rssi-dashboard/rssi-dashboard.module';
import { ApprovalWorkflowsModule } from './approval-workflows/workflows.module';
import { SignatureCampaignsModule } from './signature-campaigns/campaigns.module';
import { RagModule } from './rag/rag.module';
import { CertificatesModule } from './certificates/certificates.module';
import { ExternalPersonsModule } from './external-persons/external-persons.module';
import { KnowBe4Module } from './knowbe4/knowbe4.module';
import { BackupModule } from './backup/backup.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ChatModule } from './chat/chat.module';
import { TicketSpacesModule } from './ticket-spaces/ticket-spaces.module';
import { TestimonialsModule } from './testimonials/testimonials.module';
import { MediaModule } from './media/media.module';
import { SystemMonitoringModule } from './system-monitoring/system-monitoring.module';
import { PcaModule } from './pca/pca.module';

@Module({
  imports: [
    // Structured JSON logging (dev: pretty, prod: ndjson) with X-Request-ID
    // correlation. Level configurable via LOG_LEVEL.
    LoggerModule.forRoot(buildPinoConfig()),
    ThrottlerModule.forRoot([{
      ttl: parseInt(process.env.THROTTLE_TTL || '60000', 10),
      limit: parseInt(process.env.THROTTLE_LIMIT || '300', 10),
    }]),
    ScheduleModule.forRoot(),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
      },
    }),
    CacheModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    DepartmentsModule,
    DocumentsModule,
    SignaturesModule,
    IsoControlsModule,
    NewsModule,
    NotificationsModule,
    AuditModule,
    SearchModule,
    StorageModule,
    ReportsModule,
    HealthModule,
    JobsModule,
    AppConfigModule,
    IsoAnalyzerModule,
    LdapModule,
    TicketsModule,
    VeilleModule,
    SatisfactionModule,
    PublicModule,
    MfaModule,
    ChartesModule,
    AlertsModule,
    ScannerModule,
    RunbooksModule,
    OnboardingModule,
    ExternalAccessModule,
    HelpdeskModule,
    QuizModule,
    FileserverModule,
    AdAuditModule,
    FrameworksModule,
    TipsModule,
    WikiModule,
    BannerModule,
    AiModule,
    ComplianceTasksModule,
    PushNotificationsModule,
    DataRetentionModule,
    ItExportsModule,
    SpacesModule,
    StirlingModule,
    IncidentsModule,
    OfficeModule,
    CalendarModule,
    SavedFiltersModule,
    KioskModule,
    ExportsModule,
    MentionsModule,
    SmsModule,
    MeilisearchModule,
    RssiDashboardModule,
    ApprovalWorkflowsModule,
    SignatureCampaignsModule,
    RagModule,
    AccessReviewsModule,
    CertificatesModule,
    ExternalPersonsModule,
    KnowBe4Module,
    BackupModule,
    DashboardModule,
    ChatModule,
    TicketSpacesModule,
    TestimonialsModule,
    MediaModule,
    SystemMonitoringModule,
    PcaModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
