import { Test, TestingModule } from "@nestjs/testing";
import { RssiDashboardController } from "./rssi-dashboard.controller";
import { RssiDashboardService } from "./rssi-dashboard.service";
import { RssiSmsiPdfGenerator } from "./pdf-generator";
import { Reflector } from "@nestjs/core";
import { UserRole } from "../common/enums";
import { ROLES_KEY } from "../auth/decorators/roles.decorator";
import type { Request, Response } from "express";

/**
 * Tests RSSI dashboard controller :
 *  (a) RBAC happy path : controller-level @Roles ADMIN/REVIEWER/SUPER_ADMIN
 *  (b) RBAC autorisation refusée pour COLLABORATEUR (pas dans la metadata)
 *  (c) generateReport (input fallback "RSSI" si user incomplet)
 */
describe("RssiDashboardController", () => {
  let controller: RssiDashboardController;
  let service: any;
  let pdf: any;
  let reflector: Reflector;

  const buildRequest = (user?: any): Request => {
    return {
      ip: "127.0.0.1",
      headers: { "user-agent": "jest" },
      user,
    } as unknown as Request;
  };

  const buildResponse = () => {
    const res: Partial<Response> = {
      setHeader: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
    return res as Response;
  };

  beforeEach(async () => {
    service = {
      getSnapshot: jest.fn().mockResolvedValue({ score: 75, criticalIncidents: 2 }),
      getSmsiState: jest.fn().mockResolvedValue({ status: "CERTIFIED" }),
      getIncidentTrend: jest.fn().mockResolvedValue([{ month: "2026-01", count: 5 }]),
      getComplianceProgress: jest.fn().mockResolvedValue([{ controlId: "A.5.1", progress: 80 }]),
      getOperationalIndicators: jest.fn().mockResolvedValue({ mttr: 4.2, slaCompliance: 95 }),
      getIsoPyramid: jest.fn().mockResolvedValue({
        generatedAt: "2026-06-13T00:00:00.000Z",
        levels: [
          {
            level: "GOVERNANCE",
            total: 5,
            approved: 4,
            coveragePct: 80,
            byPriority: { CRITICAL: 2, HIGH: 1, MEDIUM: 1, LOW: 1 },
          },
        ],
        totals: {
          documents: 20,
          approved: 15,
          blocking: 3,
          sharePointSync: 12,
          coveragePct: 75,
        },
        classifications: { SECRET: 1, CONFIDENTIEL: 3, INTERNE: 14, PUBLIC: 2 },
      }),
    };

    pdf = {
      generate: jest.fn().mockResolvedValue({
        fileName: "smsi-2026-01.pdf",
        exportId: "export-1",
        hash: "sha256-abc",
        generatedAt: new Date().toISOString(),
        buffer: Buffer.from("PDF DATA"),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RssiDashboardController],
      providers: [
        { provide: RssiDashboardService, useValue: service },
        { provide: RssiSmsiPdfGenerator, useValue: pdf },
        Reflector,
      ],
    }).compile();

    controller = module.get<RssiDashboardController>(RssiDashboardController);
    reflector = module.get<Reflector>(Reflector);
  });

  describe("RBAC metadata (autorisation)", () => {
    it("controller-level @Roles requires ADMIN/REVIEWER/SUPER_ADMIN", () => {
      const roles = reflector.get<UserRole[]>(ROLES_KEY, RssiDashboardController);
      expect(roles).toEqual(
        expect.arrayContaining([UserRole.ADMIN, UserRole.REVIEWER, UserRole.SUPER_ADMIN]),
      );
      // COLLABORATEUR NOT allowed
      expect(roles).not.toContain(UserRole.COLLABORATEUR);
    });

    it("generateReport requires ADMIN/SUPER_ADMIN (more strict than controller)", () => {
      const roles = reflector.get<UserRole[]>(ROLES_KEY, controller.generateReport);
      expect(roles).toEqual(expect.arrayContaining([UserRole.ADMIN, UserRole.SUPER_ADMIN]));
      // REVIEWER NOT allowed for PDF generation
      expect(roles).not.toContain(UserRole.REVIEWER);
    });
  });

  describe("snapshot/SMSI state (happy path)", () => {
    it("returns snapshot from service", async () => {
      const result = await controller.getSnapshot();
      expect(result).toMatchObject({ score: 75 });
    });

    it("returns SMSI state", async () => {
      const result = await controller.getSmsiState();
      expect(result).toMatchObject({ status: "CERTIFIED" });
    });

    it("returns incident trend", async () => {
      const result = await controller.getIncidentTrend();
      expect(result).toHaveLength(1);
    });

    it("iso-pyramid delegates to service and returns aggregates", async () => {
      const result = await controller.getIsoPyramid();
      expect(service.getIsoPyramid).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        levels: expect.any(Array),
        totals: expect.objectContaining({ documents: 20, approved: 15 }),
        classifications: expect.objectContaining({ SECRET: 1 }),
      });
    });
  });

  describe("generateReport (PDF)", () => {
    it("uses author from req.user firstName+lastName", async () => {
      const req = buildRequest({
        email: "rssi@omnitech.fr",
        firstName: "Jean",
        lastName: "Dupont",
      });
      const res = buildResponse();
      await controller.generateReport(req, res);
      expect(pdf.generate).toHaveBeenCalledWith({
        author: "Jean Dupont",
        authorEmail: "rssi@omnitech.fr",
      });
      expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/pdf");
      expect(res.send).toHaveBeenCalled();
    });

    it("falls back to email when names are missing", async () => {
      const req = buildRequest({ email: "rssi@omnitech.fr" });
      const res = buildResponse();
      await controller.generateReport(req, res);
      expect(pdf.generate).toHaveBeenCalledWith({
        author: "rssi@omnitech.fr",
        authorEmail: "rssi@omnitech.fr",
      });
    });

    it('falls back to "RSSI" string when no user is on the request', async () => {
      const req = buildRequest(undefined);
      const res = buildResponse();
      await controller.generateReport(req, res);
      expect(pdf.generate).toHaveBeenCalledWith({
        author: "RSSI",
        authorEmail: undefined,
      });
    });
  });
});
