import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { WorkflowEngineService, WorkflowGraphInput } from "./workflow-engine.service";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Tests unitaires WorkflowEngineService — couvre :
 *  - validation DAG (cycle, START unique, END ≥ 1, orphelins, BRANCH ≥ 2 sortants)
 *  - tri topologique
 *  - évaluation des conditions JSON (eq/gte/in/and/or…)
 *  - résolution des transitions (computeNextSteps) sur APPROVAL / BRANCH / END
 *  - sérialisation du graphe (getGraph)
 */
describe("WorkflowEngineService", () => {
  let service: WorkflowEngineService;
  let prisma: {
    approvalWorkflow: {
      findUnique: jest.Mock;
    };
    approvalInstance: {
      count: jest.Mock;
    };
    workflowStep: {
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    approvalStepInstance: {
      deleteMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      approvalWorkflow: { findUnique: jest.fn() },
      approvalInstance: { count: jest.fn().mockResolvedValue(0) },
      workflowStep: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      approvalStepInstance: { deleteMany: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowEngineService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<WorkflowEngineService>(WorkflowEngineService);
  });

  // ---------------------------------------------------------------------------
  // validateGraph — cas valides + invalides
  // ---------------------------------------------------------------------------

  describe("validateGraph", () => {
    const validLinearGraph: WorkflowGraphInput = {
      nodes: [
        { id: "n1", type: "START", label: "Début", position: { x: 0, y: 0 } },
        { id: "n2", type: "APPROVAL", label: "Validation", position: { x: 100, y: 0 } },
        { id: "n3", type: "END", label: "Fin", position: { x: 200, y: 0 } },
      ],
      edges: [
        { source: "n1", target: "n2" },
        { source: "n2", target: "n3" },
      ],
    };

    it("accepte un graphe linéaire START → APPROVAL → END", () => {
      expect(() => service.validateGraph(validLinearGraph)).not.toThrow();
    });

    it("refuse un graphe vide", () => {
      expect(() => service.validateGraph({ nodes: [], edges: [] })).toThrow(
        BadRequestException,
      );
    });

    it("refuse une arête vers un noeud inexistant", () => {
      expect(() =>
        service.validateGraph({
          nodes: validLinearGraph.nodes,
          edges: [
            ...validLinearGraph.edges,
            { source: "n2", target: "nope" },
          ],
        }),
      ).toThrow(/cible nope inexistante/);
    });

    it("refuse l'absence de noeud START", () => {
      expect(() =>
        service.validateGraph({
          nodes: validLinearGraph.nodes.filter((n) => n.type !== "START"),
          edges: [{ source: "n2", target: "n3" }],
        }),
      ).toThrow(/doit contenir un noeud START/);
    });

    it("refuse plusieurs noeuds START", () => {
      expect(() =>
        service.validateGraph({
          nodes: [
            ...validLinearGraph.nodes,
            { id: "n4", type: "START", label: "Autre début" },
          ],
          edges: validLinearGraph.edges,
        }),
      ).toThrow(/EXACTEMENT UN noeud START/);
    });

    it("refuse l'absence de noeud END", () => {
      expect(() =>
        service.validateGraph({
          nodes: validLinearGraph.nodes.filter((n) => n.type !== "END"),
          edges: [{ source: "n1", target: "n2" }],
        }),
      ).toThrow(/au moins un noeud END/);
    });

    it("détecte un cycle simple A→B→A", () => {
      expect(() =>
        service.validateGraph({
          nodes: [
            { id: "n1", type: "START", label: "S" },
            { id: "n2", type: "APPROVAL", label: "A" },
            { id: "n3", type: "APPROVAL", label: "B" },
            { id: "n4", type: "END", label: "E" },
          ],
          edges: [
            { source: "n1", target: "n2" },
            { source: "n2", target: "n3" },
            { source: "n3", target: "n2" }, // cycle ici
            { source: "n3", target: "n4" },
          ],
        }),
      ).toThrow(/Cycle détecté/);
    });

    it("détecte les noeuds orphelins (pas accessibles depuis START)", () => {
      expect(() =>
        service.validateGraph({
          nodes: [
            { id: "n1", type: "START", label: "S" },
            { id: "n2", type: "APPROVAL", label: "A" },
            { id: "n3", type: "END", label: "E" },
            { id: "orphan", type: "APPROVAL", label: "Orphelin" },
            { id: "endOrphan", type: "END", label: "FinOrpheline" },
          ],
          edges: [
            { source: "n1", target: "n2" },
            { source: "n2", target: "n3" },
            { source: "orphan", target: "endOrphan" },
          ],
        }),
      ).toThrow(/orphelin/i);
    });

    it("refuse un noeud END avec une transition sortante", () => {
      expect(() =>
        service.validateGraph({
          nodes: [
            { id: "n1", type: "START", label: "S" },
            { id: "n2", type: "APPROVAL", label: "A" },
            { id: "n3", type: "END", label: "E1" },
            { id: "n4", type: "END", label: "E2" },
          ],
          edges: [
            { source: "n1", target: "n2" },
            { source: "n2", target: "n3" },
            { source: "n3", target: "n4" }, // END → quelque chose
          ],
        }),
      ).toThrow(/END.*ne doit pas avoir de transition sortante/);
    });

    it("refuse un noeud BRANCH avec moins de 2 sortants", () => {
      expect(() =>
        service.validateGraph({
          nodes: [
            { id: "n1", type: "START", label: "S" },
            { id: "n2", type: "BRANCH", label: "Si" },
            { id: "n3", type: "END", label: "E" },
          ],
          edges: [
            { source: "n1", target: "n2" },
            { source: "n2", target: "n3" }, // 1 seul sortant
          ],
        }),
      ).toThrow(/BRANCH.*au moins 2 transitions sortantes/);
    });

    it("accepte un BRANCH avec 2+ sortants", () => {
      expect(() =>
        service.validateGraph({
          nodes: [
            { id: "n1", type: "START", label: "S" },
            { id: "n2", type: "BRANCH", label: "Si" },
            { id: "n3", type: "APPROVAL", label: "Branche A" },
            { id: "n4", type: "APPROVAL", label: "Branche B" },
            { id: "n5", type: "END", label: "E" },
          ],
          edges: [
            { source: "n1", target: "n2" },
            { source: "n2", target: "n3" },
            { source: "n2", target: "n4" },
            { source: "n3", target: "n5" },
            { source: "n4", target: "n5" },
          ],
        }),
      ).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // topologicalSort
  // ---------------------------------------------------------------------------

  describe("topologicalSort", () => {
    it("retourne l'ordre topologique correct sur un graphe diamant", () => {
      const order = service.topologicalSort({
        nodes: [
          { id: "a", type: "START", label: "" },
          { id: "b", type: "APPROVAL", label: "" },
          { id: "c", type: "APPROVAL", label: "" },
          { id: "d", type: "END", label: "" },
        ],
        edges: [
          { source: "a", target: "b" },
          { source: "a", target: "c" },
          { source: "b", target: "d" },
          { source: "c", target: "d" },
        ],
      });
      // a doit être 1er, d doit être dernier
      expect(order[0]).toBe("a");
      expect(order[order.length - 1]).toBe("d");
      // b, c doivent être avant d
      expect(order.indexOf("b")).toBeLessThan(order.indexOf("d"));
      expect(order.indexOf("c")).toBeLessThan(order.indexOf("d"));
    });

    it("lève si cycle", () => {
      expect(() =>
        service.topologicalSort({
          nodes: [
            { id: "a", type: "APPROVAL", label: "" },
            { id: "b", type: "APPROVAL", label: "" },
          ],
          edges: [
            { source: "a", target: "b" },
            { source: "b", target: "a" },
          ],
        }),
      ).toThrow(/cycle/i);
    });
  });

  // ---------------------------------------------------------------------------
  // evaluateCondition
  // ---------------------------------------------------------------------------

  describe("evaluateCondition", () => {
    it("retourne true si condition null/undefined", () => {
      expect(service.evaluateCondition(null, {})).toBe(true);
      expect(service.evaluateCondition(undefined, {})).toBe(true);
    });

    it("évalue eq", () => {
      expect(
        service.evaluateCondition(
          { field: "category", op: "eq", value: "POLICY" },
          { category: "POLICY" },
        ),
      ).toBe(true);
      expect(
        service.evaluateCondition(
          { field: "category", op: "eq", value: "POLICY" },
          { category: "OTHER" },
        ),
      ).toBe(false);
    });

    it("évalue gte sur des nombres", () => {
      expect(
        service.evaluateCondition(
          { field: "amount", op: "gte", value: 10000 },
          { amount: 15000 },
        ),
      ).toBe(true);
      expect(
        service.evaluateCondition(
          { field: "amount", op: "gte", value: 10000 },
          { amount: 5000 },
        ),
      ).toBe(false);
    });

    it("évalue in (value est un tableau)", () => {
      expect(
        service.evaluateCondition(
          { field: "tag", op: "in", value: ["urgent", "RGPD"] },
          { tag: "urgent" },
        ),
      ).toBe(true);
      expect(
        service.evaluateCondition(
          { field: "tag", op: "in", value: ["urgent", "RGPD"] },
          { tag: "trivial" },
        ),
      ).toBe(false);
    });

    it("évalue contains (actual est un tableau)", () => {
      expect(
        service.evaluateCondition(
          { field: "labels", op: "contains", value: "high-risk" },
          { labels: ["normal", "high-risk", "RGPD"] },
        ),
      ).toBe(true);
    });

    it("compose avec and / or", () => {
      const condition = {
        and: [
          { field: "category", op: "eq", value: "POLICY" },
          {
            or: [
              { field: "amount", op: "gte", value: 10000 },
              { field: "urgent", op: "eq", value: true },
            ],
          },
        ],
      };
      expect(
        service.evaluateCondition(condition, {
          category: "POLICY",
          amount: 5000,
          urgent: true,
        }),
      ).toBe(true);
      expect(
        service.evaluateCondition(condition, {
          category: "OTHER",
          amount: 50000,
          urgent: true,
        }),
      ).toBe(false);
    });

    it("retourne false sur opérateur inconnu", () => {
      expect(
        service.evaluateCondition(
          { field: "x", op: "regex", value: "abc" },
          { x: "abc" },
        ),
      ).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // computeNextSteps — séquence simple, BRANCH conditionnel, parallèles
  // ---------------------------------------------------------------------------

  describe("computeNextSteps", () => {
    it("APPROVAL séquentiel : retourne nextStepIds tel quel", () => {
      const result = service.computeNextSteps(
        { id: "a", type: "APPROVAL", nextStepIds: ["b"] },
        [{ id: "b", condition: null }],
        {},
      );
      expect(result).toEqual(["b"]);
    });

    it("END : retourne []", () => {
      const result = service.computeNextSteps(
        { id: "a", type: "END", nextStepIds: ["b"] },
        [],
        {},
      );
      expect(result).toEqual([]);
    });

    it("PARALLEL_ALL : retourne tous les nextStepIds", () => {
      const result = service.computeNextSteps(
        { id: "a", type: "PARALLEL_ALL", nextStepIds: ["b", "c", "d"] },
        [],
        {},
      );
      expect(result).toEqual(["b", "c", "d"]);
    });

    it("PARALLEL_ANY : même comportement (l'engine gère le 1er APPROVED en aval)", () => {
      const result = service.computeNextSteps(
        { id: "a", type: "PARALLEL_ANY", nextStepIds: ["b", "c"] },
        [],
        {},
      );
      expect(result).toEqual(["b", "c"]);
    });

    it("BRANCH : ne retient que les transitions dont la condition matche", () => {
      const result = service.computeNextSteps(
        { id: "a", type: "BRANCH", nextStepIds: ["high", "low"] },
        [
          {
            id: "high",
            condition: { field: "amount", op: "gte", value: 10000 },
          },
          {
            id: "low",
            condition: { field: "amount", op: "lt", value: 10000 },
          },
        ],
        { amount: 50000 },
      );
      expect(result).toEqual(["high"]);
    });

    it("BRANCH : fallback sur le 1er sortant si aucune condition ne matche", () => {
      const result = service.computeNextSteps(
        { id: "a", type: "BRANCH", nextStepIds: ["high", "low"] },
        [
          {
            id: "high",
            condition: { field: "amount", op: "gte", value: 100000 },
          },
          {
            id: "low",
            condition: { field: "amount", op: "lt", value: 100 },
          },
        ],
        { amount: 5000 },
      );
      expect(result).toEqual(["high"]); // fallback default = premier
    });
  });

  // ---------------------------------------------------------------------------
  // getGraph (sérialisation)
  // ---------------------------------------------------------------------------

  describe("getGraph", () => {
    it("retourne nodes + edges depuis nextStepIds", async () => {
      prisma.approvalWorkflow.findUnique.mockResolvedValue({
        id: "wf-1",
        name: "Validation",
        steps: [
          {
            id: "s1",
            order: 1,
            name: "Début",
            type: "START",
            mode: "SINGLE",
            approverRole: null,
            approverUserId: null,
            approverDeptId: null,
            approverUser: null,
            approverDept: null,
            slaHours: null,
            minApprovers: 1,
            condition: null,
            autoApproveOnTimeout: false,
            positionX: 0,
            positionY: 0,
            nextStepIds: ["s2"],
          },
          {
            id: "s2",
            order: 2,
            name: "Validation",
            type: "APPROVAL",
            mode: "SINGLE",
            approverRole: "REVIEWER",
            approverUserId: null,
            approverDeptId: null,
            approverUser: null,
            approverDept: null,
            slaHours: 48,
            minApprovers: 1,
            condition: null,
            autoApproveOnTimeout: false,
            positionX: 200,
            positionY: 0,
            nextStepIds: ["s3"],
          },
          {
            id: "s3",
            order: 3,
            name: "Fin",
            type: "END",
            mode: "SINGLE",
            approverRole: null,
            approverUserId: null,
            approverDeptId: null,
            approverUser: null,
            approverDept: null,
            slaHours: null,
            minApprovers: 1,
            condition: null,
            autoApproveOnTimeout: false,
            positionX: 400,
            positionY: 0,
            nextStepIds: [],
          },
        ],
      });

      const graph = await service.getGraph("wf-1");

      expect(graph.nodes).toHaveLength(3);
      expect(graph.edges).toHaveLength(2);
      expect(graph.edges).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ source: "s1", target: "s2" }),
          expect.objectContaining({ source: "s2", target: "s3" }),
        ]),
      );
    });

    it("lève NotFoundException si workflow inexistant", async () => {
      prisma.approvalWorkflow.findUnique.mockResolvedValue(null);
      await expect(service.getGraph("nope")).rejects.toThrow(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------------
  // saveGraph — refus si instances PENDING en cours
  // ---------------------------------------------------------------------------

  describe("saveGraph", () => {
    it("refuse la sauvegarde si une instance PENDING existe", async () => {
      prisma.approvalWorkflow.findUnique.mockResolvedValue({ id: "wf-1" });
      prisma.approvalInstance.count.mockResolvedValue(2);

      await expect(
        service.saveGraph("wf-1", {
          nodes: [
            { id: "n1", type: "START", label: "S" },
            { id: "n2", type: "END", label: "E" },
          ],
          edges: [{ source: "n1", target: "n2" }],
        }),
      ).rejects.toThrow(/instance.*en cours/i);
    });
  });
});
