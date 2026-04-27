import { Test, TestingModule } from '@nestjs/testing';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditAnonymizationService } from './audit-anonymization.service';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../common/enums';
import type { Response } from 'express';

/**
 * Tests audit controller :
 *  (a) my-activity (utilisateur) → renvoie les logs de l'utilisateur courant
 *  (b) findAll (ADMIN+) → délégation findAll avec filtres
 *  (c) limit cap → cap à 100, défaut 10
 *  (d) export CSV → délégation et headers HTTP
 */
describe('AuditController', () => {
  let controller: AuditController;
  let auditService: any;
  let anonymization: any;

  const mockUser = {
    id: 'user-1',
    email: 'jdoe@omnitech.fr',
    role: UserRole.COLLABORATEUR,
  };

  const buildResponse = () => {
    const res: Partial<Response> = {
      set: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
    return res as Response;
  };

  beforeEach(async () => {
    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
      findAll: jest.fn().mockResolvedValue({
        data: [
          {
            createdAt: new Date('2026-01-15'),
            action: 'LOGIN',
            resourceType: 'User',
            resourceId: 'user-1',
            userId: 'user-1',
            user: { email: 'jdoe@omnitech.fr' },
            ipAddress: '127.0.0.1',
            userAgent: 'jest',
          },
        ],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      }),
      findByResource: jest.fn().mockResolvedValue([]),
      getStats: jest.fn().mockResolvedValue({
        totalEvents: 100,
        eventsByDay: [],
        topActors: [],
        topActions: [],
      }),
    };

    anonymization = {
      getStats: jest.fn().mockResolvedValue({
        policy: { fullDays: 90, anonymizedDays: 730, lastRunAt: null },
        auditLogsToAnonymize: 0,
        auditLogsToDelete: 0,
        cutoffs: { fullDays: null, anonymizedDays: null },
      }),
      getPolicy: jest
        .fn()
        .mockResolvedValue({ fullDays: 90, anonymizedDays: 730, lastRunAt: null }),
      updatePolicy: jest
        .fn()
        .mockResolvedValue({ fullDays: 60, anonymizedDays: 730, lastRunAt: null }),
      runFullCycle: jest.fn().mockResolvedValue({
        anonymizedCount: 0,
        deletedCount: 0,
        durationMs: 1,
        errors: [],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [
        { provide: AuditService, useValue: auditService },
        { provide: AuditAnonymizationService, useValue: anonymization },
        Reflector,
      ],
    }).compile();

    controller = module.get<AuditController>(AuditController);
  });

  describe('my-activity (happy path)', () => {
    it('returns the current user activity scoped to userId', async () => {
      const result = await controller.getMyActivity(mockUser as any, '20');
      expect(auditService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', limit: 20 }),
      );
      expect(result.data).toHaveLength(1);
    });

    it('caps limit to 100 (anti-exfiltration)', async () => {
      await controller.getMyActivity(mockUser as any, '9999');
      expect(auditService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 100 }),
      );
    });

    it('defaults limit to 10 when no param', async () => {
      await controller.getMyActivity(mockUser as any);
      expect(auditService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10 }),
      );
    });

    it('defaults limit to 10 when input is non-numeric (parseInt → NaN)', async () => {
      await controller.getMyActivity(mockUser as any, 'abc');
      expect(auditService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10 }),
      );
    });
  });

  describe('findAll (ADMIN+)', () => {
    it('passes filters to service (action, severity, dates)', async () => {
      await controller.findAll(
        'user-2',
        'GDPR_DATA_EXPORT',
        'User',
        'CRITICAL',
        'true',
        '2026-01-01',
        '2026-01-31',
        '2',
        '50',
      );
      expect(auditService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-2',
          action: 'GDPR_DATA_EXPORT',
          resourceType: 'User',
          severity: 'CRITICAL',
          bulk: true,
          dateFrom: expect.any(Date),
          dateTo: expect.any(Date),
          page: 2,
          limit: 50,
        }),
      );
    });

    it('uses defaults when no params provided', async () => {
      await controller.findAll();
      expect(auditService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 50, bulk: undefined }),
      );
    });
  });

  describe('export CSV (SUPER_ADMIN)', () => {
    it('responds with text/csv content-type and attachment disposition', async () => {
      const res = buildResponse();
      await controller.exportCsv(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        res,
      );
      expect(res.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': expect.stringContaining('attachment'),
          'Cache-Control': 'private, no-store',
        }),
      );
      expect(res.send).toHaveBeenCalled();
    });
  });

  describe('findByResource (input invalide)', () => {
    it('passes type+id to service', async () => {
      await controller.findByResource('Document', '11111111-1111-1111-1111-111111111111');
      expect(auditService.findByResource).toHaveBeenCalledWith(
        'Document',
        '11111111-1111-1111-1111-111111111111',
      );
    });
  });

  describe('getStats', () => {
    it('uses last 30 days by default', async () => {
      await controller.getStats();
      expect(auditService.getStats).toHaveBeenCalledWith(
        expect.any(Date),
        expect.any(Date),
      );
    });

    it('parses from/to date strings', async () => {
      await controller.getStats('2026-01-01', '2026-01-31');
      const [from, to] = auditService.getStats.mock.calls[0];
      expect(from.toISOString().startsWith('2026-01-01')).toBe(true);
      expect(to.toISOString().startsWith('2026-01-31')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // RGPD anonymization endpoints — Item 29
  // ---------------------------------------------------------------------------

  describe('GET /audit/retention', () => {
    it('returns the anonymization stats', async () => {
      const out = await controller.getRetentionStats();
      expect(out.policy.fullDays).toBe(90);
      expect(anonymization.getStats).toHaveBeenCalled();
    });
  });

  describe('PATCH /audit/retention', () => {
    it('rejects empty body', async () => {
      await expect(
        controller.updateRetention({} as any, mockUser as any),
      ).rejects.toThrow();
    });

    it('rejects negative values', async () => {
      await expect(
        controller.updateRetention(
          { fullDays: -5 } as any,
          mockUser as any,
        ),
      ).rejects.toThrow(/positive integer/i);
    });

    it('rejects fullDays >= anonymizedDays (illogical pipeline)', async () => {
      anonymization.getPolicy.mockResolvedValue({
        fullDays: 90,
        anonymizedDays: 730,
        lastRunAt: null,
      });
      await expect(
        controller.updateRetention(
          { fullDays: 800 } as any,
          mockUser as any,
        ),
      ).rejects.toThrow(/strictly less/i);
    });

    it('accepts NEVER as legal-hold sentinel', async () => {
      await controller.updateRetention(
        { fullDays: 'NEVER', anonymizedDays: 'NEVER' } as any,
        mockUser as any,
      );
      expect(anonymization.updatePolicy).toHaveBeenCalledWith(
        { fullDays: null, anonymizedDays: null },
        mockUser.id,
      );
    });

    it('parses string-encoded numbers (form clients)', async () => {
      await controller.updateRetention(
        { fullDays: '120' } as any,
        mockUser as any,
      );
      expect(anonymization.updatePolicy).toHaveBeenCalledWith(
        { fullDays: 120, anonymizedDays: undefined },
        mockUser.id,
      );
    });
  });

  describe('POST /audit/anonymize-now', () => {
    it('triggers a full cycle and audits the manual run', async () => {
      anonymization.runFullCycle.mockResolvedValue({
        anonymizedCount: 3,
        deletedCount: 1,
        durationMs: 12,
        errors: [],
      });
      const out = await controller.anonymizeNow(mockUser as any);
      expect(out.anonymizedCount).toBe(3);
      expect(out.deletedCount).toBe(1);
      // The manual trigger is itself logged in audit (chain of trust)
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'AUDIT_LOG_ANONYMIZATION_MANUAL',
          userId: mockUser.id,
          severity: 'WARN',
        }),
      );
    });
  });
});
