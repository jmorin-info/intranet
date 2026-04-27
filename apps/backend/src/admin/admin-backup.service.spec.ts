import * as childProcess from "child_process";

jest.mock("child_process");
jest.mock("util", () => {
  const actual = jest.requireActual("util");
  return {
    ...actual,
    promisify: jest.fn(() => mockExecAsync),
  };
});

const mockExecAsync = jest.fn();

// IMPORTANT : importer après les mocks pour que promisify soit déjà patché
// quand admin-backup.service.ts évalue `const execAsync = promisify(exec);`
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AdminBackupService } = require("./admin-backup.service");

/**
 * Wave D item 20 — admin-backup.service tests.
 * Couvre : pas de RESTIC_REPOSITORY, snapshots OK (frais + stale),
 * Restic CLI absent / repo unreachable, snapshot vide, parsing.
 */
describe("AdminBackupService", () => {
  let service: InstanceType<typeof AdminBackupService>;
  const ORIG_ENV = process.env;

  beforeEach(() => {
    mockExecAsync.mockReset();
    process.env = { ...ORIG_ENV };
    service = new AdminBackupService();
  });

  afterAll(() => {
    process.env = ORIG_ENV;
  });

  it("retourne available=false si RESTIC_REPOSITORY absent", async () => {
    delete process.env.RESTIC_REPOSITORY;
    const status = await service.getStatus();

    expect(status.available).toBe(false);
    expect(status.reason).toMatch(/RESTIC_REPOSITORY/);
    expect(status.alerts).toContain(
      "Restic non configuré (offsite backup désactivé)",
    );
  });

  it("retourne le dernier snapshot quand restic répond", async () => {
    process.env.RESTIC_REPOSITORY = "s3:s3.fr-par.scw.cloud/test/intranet";
    const recentDate = new Date(Date.now() - 3 * 3600_000).toISOString(); // 3h
    const olderDate = new Date(Date.now() - 25 * 3600_000).toISOString();
    mockExecAsync.mockResolvedValue({
      stdout: JSON.stringify([
        {
          id: "abc1234567",
          short_id: "abc1234",
          time: olderDate,
          hostname: "intranet-prod",
          tags: ["database"],
        },
        {
          id: "def9876543",
          short_id: "def9876",
          time: recentDate,
          hostname: "intranet-prod",
          tags: ["database", "host:intranet-prod"],
        },
      ]),
      stderr: "",
    });

    const status = await service.getStatus();

    expect(status.available).toBe(true);
    expect(status.lastSnapshot?.shortId).toBe("def9876");
    expect(status.lastSnapshot?.ageSeconds).toBeLessThan(4 * 3600);
    expect(status.recentSnapshots).toHaveLength(2);
    // Tri décroissant
    expect(status.recentSnapshots[0].shortId).toBe("def9876");
    expect(status.alerts).toHaveLength(0);
  });

  it("alerte WARN si dernier snapshot > 30h", async () => {
    process.env.RESTIC_REPOSITORY = "s3:test/repo";
    const oldDate = new Date(Date.now() - 35 * 3600_000).toISOString();
    mockExecAsync.mockResolvedValue({
      stdout: JSON.stringify([
        {
          id: "old1234567",
          short_id: "old1234",
          time: oldDate,
          hostname: "intranet-prod",
          tags: ["database"],
        },
      ]),
      stderr: "",
    });

    const status = await service.getStatus();

    expect(status.alerts).toEqual(
      expect.arrayContaining([expect.stringMatching(/WARN/)]),
    );
  });

  it("alerte CRITIQUE si dernier snapshot > 48h", async () => {
    process.env.RESTIC_REPOSITORY = "s3:test/repo";
    const oldDate = new Date(Date.now() - 60 * 3600_000).toISOString();
    mockExecAsync.mockResolvedValue({
      stdout: JSON.stringify([
        {
          id: "stale123456",
          short_id: "stale12",
          time: oldDate,
          hostname: "intranet-prod",
          tags: ["database"],
        },
      ]),
      stderr: "",
    });

    const status = await service.getStatus();

    expect(status.alerts).toEqual(
      expect.arrayContaining([expect.stringMatching(/CRITIQUE/)]),
    );
  });

  it("retourne available=false si restic CLI absent / fail", async () => {
    process.env.RESTIC_REPOSITORY = "s3:test/repo";
    mockExecAsync.mockRejectedValue(new Error("restic: command not found"));

    const status = await service.getStatus();

    expect(status.available).toBe(false);
    expect(status.reason).toMatch(/restic snapshots/);
    expect(status.alerts.length).toBeGreaterThan(0);
  });

  it("gère le cas snapshot vide (premier déploiement)", async () => {
    process.env.RESTIC_REPOSITORY = "s3:test/repo";
    mockExecAsync.mockResolvedValue({ stdout: "[]", stderr: "" });

    const status = await service.getStatus();

    expect(status.available).toBe(true);
    expect(status.recentSnapshots).toEqual([]);
    expect(status.alerts).toEqual(
      expect.arrayContaining([expect.stringMatching(/Aucun snapshot/)]),
    );
  });

  // childProcess.exec is mocked just to avoid hitting the system; not directly tested
  it("le service ne dépend pas directement de child_process.exec dans les tests", () => {
    expect(jest.isMockFunction(childProcess.exec)).toBe(true);
  });
});
