import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';
import { CertificatesService } from '../certificates/certificates.service';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

@Injectable()
export class KnowBe4Service {
  private readonly logger = new Logger(KnowBe4Service.name);
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
    private readonly certificatesService: CertificatesService,
  ) {}

  // ---------------------------------------------------------------------------
  // Config resolution: DB (AppConfig) overrides .env
  // ---------------------------------------------------------------------------

  private async getConfigValue(
    dbKey: string,
    envKey: string,
  ): Promise<string | null> {
    const dbRow = await this.appConfig.findByKey(dbKey);
    if (dbRow?.value) return dbRow.value;
    return process.env[envKey] ?? null;
  }

  private async getApiUrl(): Promise<string> {
    const url = await this.getConfigValue('knowbe4_api_url', 'KNOWBE4_API_URL');
    return url || 'https://eu.api.knowbe4.com/v1';
  }

  private async getApiToken(): Promise<string | null> {
    return this.getConfigValue('knowbe4_api_token', 'KNOWBE4_API_TOKEN');
  }

  private async buildClient(): Promise<AxiosInstance | null> {
    const token = await this.getApiToken();
    if (!token) {
      this.logger.warn('KnowBe4 API token not configured');
      return null;
    }
    const baseURL = await this.getApiUrl();
    return axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    });
  }

  // ---------------------------------------------------------------------------
  // In-memory cache
  // ---------------------------------------------------------------------------

  private getCached<T>(key: string): T | undefined {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.data;
  }

  private setCache<T>(key: string, data: T): void {
    this.cache.set(key, { data, expiresAt: Date.now() + this.CACHE_TTL });
  }

  // ---------------------------------------------------------------------------
  // API methods
  // ---------------------------------------------------------------------------

  async getAccount(): Promise<Record<string, unknown> | null> {
    const cached = this.getCached<Record<string, unknown>>('account');
    if (cached) return cached;

    const client = await this.buildClient();
    if (!client) return null;

    try {
      const { data } = await client.get('/account');
      this.setCache('account', data);
      return data as Record<string, unknown>;
    } catch (err: unknown) {
      this.logger.error('Failed to fetch KnowBe4 account', (err as Error).message);
      return null;
    }
  }

  async getUsers(perPage = 500): Promise<unknown[] | null> {
    const cacheKey = `users:${perPage}`;
    const cached = this.getCached<unknown[]>(cacheKey);
    if (cached) return cached;

    const client = await this.buildClient();
    if (!client) return null;

    try {
      const { data } = await client.get('/users', {
        params: { per_page: perPage },
      });
      const result = data as unknown[];
      this.setCache(cacheKey, result);
      return result;
    } catch (err: unknown) {
      this.logger.error('Failed to fetch KnowBe4 users', (err as Error).message);
      return null;
    }
  }

  async getCampaigns(): Promise<unknown[] | null> {
    const cached = this.getCached<unknown[]>('campaigns');
    if (cached) return cached;

    const client = await this.buildClient();
    if (!client) return null;

    try {
      const { data } = await client.get('/training/campaigns');
      const result = data as unknown[];
      this.setCache('campaigns', result);
      return result;
    } catch (err: unknown) {
      this.logger.error('Failed to fetch KnowBe4 campaigns', (err as Error).message);
      return null;
    }
  }

  async getEnrollments(perPage = 500): Promise<unknown[] | null> {
    const cacheKey = `enrollments:${perPage}`;
    const cached = this.getCached<unknown[]>(cacheKey);
    if (cached) return cached;

    const client = await this.buildClient();
    if (!client) return null;

    try {
      const { data } = await client.get('/training/enrollments', {
        params: { per_page: perPage },
      });
      const result = data as unknown[];
      this.setCache(cacheKey, result);
      return result;
    } catch (err: unknown) {
      this.logger.error('Failed to fetch KnowBe4 enrollments', (err as Error).message);
      return null;
    }
  }

  async getUserTrainingStatus(
    email: string,
  ): Promise<{ email: string; enrollments: unknown[] } | null> {
    const allEnrollments = await this.getEnrollments(500);
    if (!allEnrollments) return null;

    const lowerEmail = email.toLowerCase();
    const userEnrollments = allEnrollments.filter((e: any) => {
      const userEmail: string | undefined = e?.user?.email;
      return userEmail?.toLowerCase() === lowerEmail;
    });

    return { email, enrollments: userEnrollments };
  }

  // ---------------------------------------------------------------------------
  // Sync certificates: KB4 "Passed" enrollments -> intranet Certificate
  // ---------------------------------------------------------------------------

  async syncCertificates(triggeredById: string): Promise<{
    created: number;
    skipped: number;
    errors: number;
  }> {
    const enrollments = await this.getEnrollments(500);
    if (!enrollments) {
      return { created: 0, skipped: 0, errors: 0 };
    }

    let created = 0;
    let skipped = 0;
    let errors = 0;

    type Enrollment = {
      status?: string;
      user?: { email?: string };
      enrollment_id?: string | number;
      campaign_name?: string;
      module_name?: string;
      training_campaign?: { name?: string };
      completion_date?: string;
    };
    for (const enrollment of enrollments as Enrollment[]) {
      try {
        const status: string | undefined = enrollment?.status;
        if (status !== 'Passed') {
          skipped++;
          continue;
        }

        const userEmail: string | undefined = enrollment?.user?.email;
        if (!userEmail) {
          skipped++;
          continue;
        }

        // Find the intranet user by email
        const user = await this.prisma.user.findFirst({
          where: { email: { equals: userEmail, mode: 'insensitive' } },
          select: { id: true },
        });
        if (!user) {
          skipped++;
          continue;
        }

        const moduleName: string =
          enrollment?.module_name || enrollment?.campaign_name || 'KnowBe4 Training';
        const completionDate: string | undefined = enrollment?.completion_date;

        // Check for existing certificate to avoid duplicates
        const enrollmentId: string | number | undefined = enrollment?.enrollment_id;
        const certName = `[KB4] ${moduleName}`;

        const existing = await this.prisma.certificate.findFirst({
          where: {
            userId: user.id,
            name: certName,
            certType: 'KNOWBE4',
          },
        });

        if (existing) {
          skipped++;
          continue;
        }

        await this.certificatesService.create(
          {
            name: certName,
            certType: 'KNOWBE4',
            obtainedAt: completionDate
              ? new Date(completionDate).toISOString()
              : new Date().toISOString(),
            notes: enrollmentId
              ? `KnowBe4 enrollment #${enrollmentId}`
              : 'Synced from KnowBe4',
            userId: user.id,
          },
          triggeredById,
        );
        created++;
      } catch (err: unknown) {
        this.logger.error('Error syncing KB4 enrollment', (err as Error).message);
        errors++;
      }
    }

    this.logger.log(
      `KnowBe4 sync complete: created=${created}, skipped=${skipped}, errors=${errors}`,
    );
    return { created, skipped, errors };
  }
}
