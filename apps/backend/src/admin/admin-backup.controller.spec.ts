import { Test, TestingModule } from "@nestjs/testing";
import { Reflector } from "@nestjs/core";
import { AdminBackupController } from "./admin-backup.controller";
import { AdminBackupService } from "./admin-backup.service";
import { ROLES_KEY } from "../auth/decorators/roles.decorator";
import { UserRole } from "../common/enums";

/**
 * Wave D item 20 — RBAC + délégation au service.
 */
describe("AdminBackupController", () => {
  let controller: AdminBackupController;
  let service: { getStatus: jest.Mock };
  let reflector: Reflector;

  beforeEach(async () => {
    service = { getStatus: jest.fn() };
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AdminBackupController],
      providers: [{ provide: AdminBackupService, useValue: service }],
    }).compile();

    controller = moduleRef.get<AdminBackupController>(AdminBackupController);
    reflector = new Reflector();
  });

  it("@Roles(SUPER_ADMIN) est posé sur la classe", () => {
    const roles = reflector.get<UserRole[]>(ROLES_KEY, AdminBackupController);
    expect(roles).toEqual([UserRole.SUPER_ADMIN]);
  });

  it("GET /status délègue au service", async () => {
    const mockStatus = {
      available: true,
      repository: "s3:test/repo",
      recentSnapshots: [],
      alerts: [],
    };
    service.getStatus.mockResolvedValue(mockStatus);

    const result = await controller.getStatus();

    expect(service.getStatus).toHaveBeenCalledTimes(1);
    expect(result).toBe(mockStatus);
  });
});
