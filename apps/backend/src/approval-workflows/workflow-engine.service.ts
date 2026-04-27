import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { UserRole, WorkflowStepType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/**
 * WorkflowEngineService — Moteur d'exécution d'un workflow d'approbation
 * représenté comme un graphe orienté acyclique (DAG).
 *
 * Modèle :
 *  - Chaque `WorkflowStep` est un noeud avec un `type` (START | APPROVAL |
 *    BRANCH | PARALLEL_ALL | PARALLEL_ANY | DELEGATE | END).
 *  - Les transitions sont matérialisées par `WorkflowStep.nextStepIds`
 *    (string[]). Un noeud peut avoir 0+ sortants.
 *  - Le moteur n'exécute pas le graphe (les ApprovalStepInstance sont créés
 *    par WorkflowsService.createInstance), il sert à :
 *      * valider la cohérence du graphe (DAG, single START, ≥ 1 END,
 *        pas de cycle, pas de noeud orphelin) ;
 *      * sérialiser/désérialiser le graphe pour l'éditeur visuel ;
 *      * calculer la transition suivante depuis un step donné en évaluant
 *        une condition JSON éventuelle.
 *
 * Ce service est volontairement séparé de WorkflowsService pour rester
 * testable en isolation (cf. workflow-engine.spec.ts).
 *
 * Item #24 — Éditeur visuel drag&drop des règles N+1.
 */
@Injectable()
export class WorkflowEngineService {
  private readonly logger = new Logger(WorkflowEngineService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Sérialisation du graphe (GET /api/v1/approval-workflows/:id/graph)
  // ---------------------------------------------------------------------------

  /**
   * Retourne le graphe d'un workflow sous forme de `{ nodes, edges }`
   * directement consommable par l'éditeur visuel (React Flow / canvas custom).
   */
  async getGraph(workflowId: string): Promise<WorkflowGraph> {
    const wf = await this.prisma.approvalWorkflow.findUnique({
      where: { id: workflowId },
      include: {
        steps: {
          orderBy: { order: "asc" },
          include: {
            approverUser: { select: { id: true, firstName: true, lastName: true, email: true } },
            approverDept: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });
    if (!wf) {
      throw new NotFoundException(`Workflow ${workflowId} introuvable`);
    }

    const nodes: WorkflowGraphNode[] = wf.steps.map((step, idx) => ({
      id: step.id,
      type: step.type as WorkflowStepType,
      label: step.name,
      position: {
        x: step.positionX ?? 80 + idx * 220,
        y: step.positionY ?? 120,
      },
      data: {
        order: step.order,
        mode: step.mode,
        approverRole: step.approverRole,
        approverUserId: step.approverUserId,
        approverDeptId: step.approverDeptId,
        approverUser: step.approverUser ?? null,
        approverDept: step.approverDept ?? null,
        slaHours: step.slaHours,
        minApprovers: step.minApprovers,
        condition: (step.condition as unknown) ?? null,
        autoApproveOnTimeout: step.autoApproveOnTimeout,
      },
    }));

    const edges: WorkflowGraphEdge[] = [];
    for (const step of wf.steps) {
      const nexts =
        step.nextStepIds && step.nextStepIds.length > 0
          ? step.nextStepIds
          : this.fallbackNextIds(step.id, wf.steps);
      for (const targetId of nexts) {
        edges.push({
          id: `${step.id}->${targetId}`,
          source: step.id,
          target: targetId,
        });
      }
    }

    return {
      workflowId: wf.id,
      name: wf.name,
      nodes,
      edges,
    };
  }

  /** Fallback : si `nextStepIds` est vide, on chaîne au step de l'ordre suivant. */
  private fallbackNextIds(
    stepId: string,
    steps: { id: string; order: number }[],
  ): string[] {
    const me = steps.find((s) => s.id === stepId);
    if (!me) return [];
    const next = steps.find((s) => s.order === me.order + 1);
    return next ? [next.id] : [];
  }

  // ---------------------------------------------------------------------------
  // Désérialisation du graphe (PUT /api/v1/approval-workflows/:id/graph)
  // ---------------------------------------------------------------------------

  /**
   * Sauvegarde le graphe complet en remplaçant les steps existants.
   *
   * Stratégie :
   *  - Valide d'abord la cohérence DAG (cycle, START unique, END ≥ 1).
   *  - Reconstruit l'ensemble des steps en transaction : update existants,
   *    insère nouveaux, supprime ceux qui ne sont plus présents.
   *  - Écrit les nextStepIds après que tous les steps aient été créés
   *    (sinon contrainte FK implicite cassée — on n'a pas de FK SQL sur
   *    nextStepIds[] mais on garde l'ordre de création propre).
   *
   * Note : si une instance ApprovalInstance est déjà PENDING sur ce
   * workflow, on refuse la mise à jour pour ne pas corrompre l'historique.
   */
  async saveGraph(
    workflowId: string,
    graph: WorkflowGraphInput,
  ): Promise<WorkflowGraph> {
    const wf = await this.prisma.approvalWorkflow.findUnique({
      where: { id: workflowId },
    });
    if (!wf) {
      throw new NotFoundException(`Workflow ${workflowId} introuvable`);
    }

    // Bloque la mise à jour si une instance est en cours
    const pendingInstances = await this.prisma.approvalInstance.count({
      where: { workflowId, status: "PENDING" },
    });
    if (pendingInstances > 0) {
      throw new BadRequestException(
        `Le workflow a ${pendingInstances} instance(s) en cours — impossible de modifier la définition tant qu'elles ne sont pas terminées.`,
      );
    }

    // 1. Validation DAG
    this.validateGraph(graph);

    // 2. Détermine l'ordre topologique pour assigner `order` (1, 2, 3…)
    const topoOrder = this.topologicalSort(graph);

    // 3. Synchronisation en transaction
    const existing = await this.prisma.workflowStep.findMany({
      where: { workflowId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((s) => s.id));
    const incomingIds = new Set(graph.nodes.map((n) => n.id));

    const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));

    const ops: Prisma.PrismaPromise<unknown>[] = [];

    // 3a. Supprime les step-instances orphelines pour les steps à supprimer.
    //     Seul autorisé car aucune instance PENDING (vérifié plus haut).
    if (toDelete.length > 0) {
      ops.push(
        this.prisma.approvalStepInstance.deleteMany({
          where: { stepId: { in: toDelete } },
        }),
      );
      ops.push(
        this.prisma.workflowStep.deleteMany({
          where: { id: { in: toDelete } },
        }),
      );
    }

    // 3b. Upsert chaque noeud avec son order topologique
    for (let i = 0; i < topoOrder.length; i++) {
      const nodeId = topoOrder[i]!;
      const node = graph.nodes.find((n) => n.id === nodeId)!;
      const order = i + 1;

      const dataCommon = {
        order,
        name: node.label,
        type: node.type,
        mode: this.deriveMode(node.type),
        approverRole: (node.data?.approverRole ?? null) as UserRole | null,
        approverUserId: node.data?.approverUserId ?? null,
        approverDeptId: node.data?.approverDeptId ?? null,
        slaHours: node.data?.slaHours ?? null,
        minApprovers: Math.max(1, node.data?.minApprovers ?? 1),
        autoApproveOnTimeout: node.data?.autoApproveOnTimeout ?? false,
        positionX: Math.round(node.position?.x ?? 0),
        positionY: Math.round(node.position?.y ?? 0),
        condition: (node.data?.condition ?? Prisma.DbNull) as Prisma.InputJsonValue,
        nextStepIds: this.outgoingFor(nodeId, graph.edges),
      } satisfies Partial<Prisma.WorkflowStepUncheckedCreateInput>;

      if (existingIds.has(nodeId)) {
        ops.push(
          this.prisma.workflowStep.update({
            where: { id: nodeId },
            data: dataCommon as Prisma.WorkflowStepUncheckedUpdateInput,
          }),
        );
      } else {
        ops.push(
          this.prisma.workflowStep.create({
            data: {
              id: nodeId,
              workflowId,
              ...dataCommon,
            },
          }),
        );
      }
    }

    await this.prisma.$transaction(ops);

    this.logger.log(
      `Graphe workflow ${workflowId} sauvegardé : ${graph.nodes.length} noeuds, ${graph.edges.length} arêtes`,
    );

    return this.getGraph(workflowId);
  }

  /**
   * Mappe le type de noeud vers le `mode` (legacy) attendu par WorkflowsService :
   *  APPROVAL / BRANCH / DELEGATE / START / END → SINGLE
   *  PARALLEL_ALL / PARALLEL_ANY → identique
   */
  private deriveMode(type: WorkflowStepType): "SINGLE" | "PARALLEL_ALL" | "PARALLEL_ANY" {
    if (type === "PARALLEL_ALL") return "PARALLEL_ALL";
    if (type === "PARALLEL_ANY") return "PARALLEL_ANY";
    return "SINGLE";
  }

  private outgoingFor(nodeId: string, edges: WorkflowGraphEdgeInput[]): string[] {
    return edges.filter((e) => e.source === nodeId).map((e) => e.target);
  }

  // ---------------------------------------------------------------------------
  // Validation DAG (utilisable seul par la couche test)
  // ---------------------------------------------------------------------------

  /**
   * Valide qu'un graphe est :
   *  1. Bien formé : tous les target d'edges existent dans nodes
   *  2. Possède exactement UN node de type START
   *  3. Possède AU MOINS UN node de type END
   *  4. Est acyclique (DFS avec coloration)
   *  5. Tous les noeuds (sauf START) sont accessibles depuis START
   *
   * Lève BadRequestException avec un message explicite en cas d'échec.
   */
  validateGraph(graph: WorkflowGraphInput): void {
    if (!graph.nodes || graph.nodes.length === 0) {
      throw new BadRequestException("Le graphe doit contenir au moins un noeud");
    }

    const nodeIds = new Set(graph.nodes.map((n) => n.id));

    // 1. edges référencent uniquement des nodes existants
    for (const e of graph.edges) {
      if (!nodeIds.has(e.source)) {
        throw new BadRequestException(
          `Arête invalide : source ${e.source} inexistante`,
        );
      }
      if (!nodeIds.has(e.target)) {
        throw new BadRequestException(
          `Arête invalide : cible ${e.target} inexistante`,
        );
      }
    }

    // 2. exactly one START
    const starts = graph.nodes.filter((n) => n.type === "START");
    if (starts.length === 0) {
      throw new BadRequestException("Le graphe doit contenir un noeud START");
    }
    if (starts.length > 1) {
      throw new BadRequestException(
        `Le graphe doit contenir EXACTEMENT UN noeud START (${starts.length} trouvés)`,
      );
    }

    // 3. at least one END
    const ends = graph.nodes.filter((n) => n.type === "END");
    if (ends.length === 0) {
      throw new BadRequestException("Le graphe doit contenir au moins un noeud END");
    }

    // 4. cycle detection (DFS)
    const adj = this.buildAdjacency(graph);
    const cycle = this.findCycle(adj);
    if (cycle.length > 0) {
      throw new BadRequestException(
        `Cycle détecté dans le graphe : ${cycle.join(" → ")}`,
      );
    }

    // 5. tous les noeuds accessibles depuis START
    const startId = starts[0]!.id;
    const reachable = this.reachableFrom(startId, adj);
    const orphans = graph.nodes.filter((n) => !reachable.has(n.id));
    if (orphans.length > 0) {
      throw new BadRequestException(
        `Noeud(s) orphelin(s) inaccessibles depuis START : ${orphans
          .map((o) => o.label || o.id)
          .join(", ")}`,
      );
    }

    // 6. END nodes have no outgoing edges
    for (const end of ends) {
      if ((adj.get(end.id) ?? []).length > 0) {
        throw new BadRequestException(
          `Le noeud END "${end.label || end.id}" ne doit pas avoir de transition sortante`,
        );
      }
    }

    // 7. BRANCH nodes should have ≥ 2 outgoing (sinon c'est un APPROVAL qui s'ignore)
    for (const node of graph.nodes) {
      if (node.type === "BRANCH" && (adj.get(node.id) ?? []).length < 2) {
        throw new BadRequestException(
          `Le noeud BRANCH "${node.label || node.id}" doit avoir au moins 2 transitions sortantes`,
        );
      }
    }
  }

  private buildAdjacency(graph: WorkflowGraphInput): Map<string, string[]> {
    const adj = new Map<string, string[]>();
    for (const n of graph.nodes) adj.set(n.id, []);
    for (const e of graph.edges) {
      adj.get(e.source)!.push(e.target);
    }
    return adj;
  }

  /**
   * Détecte un cycle via DFS coloration (WHITE/GRAY/BLACK).
   * Retourne le chemin du cycle (vide si DAG).
   */
  private findCycle(adj: Map<string, string[]>): string[] {
    const WHITE = 0;
    const GRAY = 1;
    const BLACK = 2;
    const color = new Map<string, number>();
    for (const n of adj.keys()) color.set(n, WHITE);

    const stack: string[] = [];
    const result: string[] = [];

    const dfs = (node: string): boolean => {
      color.set(node, GRAY);
      stack.push(node);
      for (const next of adj.get(node) ?? []) {
        const c = color.get(next);
        if (c === GRAY) {
          // Cycle détecté — extraire le chemin
          const start = stack.indexOf(next);
          for (let i = start; i < stack.length; i++) {
            result.push(stack[i]!);
          }
          result.push(next);
          return true;
        }
        if (c === WHITE && dfs(next)) return true;
      }
      stack.pop();
      color.set(node, BLACK);
      return false;
    };

    for (const n of adj.keys()) {
      if (color.get(n) === WHITE && dfs(n)) return result;
    }
    return [];
  }

  private reachableFrom(start: string, adj: Map<string, string[]>): Set<string> {
    const visited = new Set<string>();
    const queue = [start];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      for (const next of adj.get(cur) ?? []) queue.push(next);
    }
    return visited;
  }

  /**
   * Tri topologique (Kahn's algorithm). Retourne la liste des nodeIds dans
   * l'ordre, en partant des sources (in-degree = 0). Lève si cycle.
   */
  topologicalSort(graph: WorkflowGraphInput): string[] {
    const adj = this.buildAdjacency(graph);
    const inDegree = new Map<string, number>();
    for (const n of graph.nodes) inDegree.set(n.id, 0);
    for (const e of graph.edges) {
      inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(id);
    }

    const result: string[] = [];
    while (queue.length > 0) {
      // Stable : on prend systématiquement le premier (FIFO)
      const cur = queue.shift()!;
      result.push(cur);
      for (const next of adj.get(cur) ?? []) {
        const newDeg = (inDegree.get(next) ?? 1) - 1;
        inDegree.set(next, newDeg);
        if (newDeg === 0) queue.push(next);
      }
    }

    if (result.length !== graph.nodes.length) {
      throw new BadRequestException(
        "Tri topologique impossible — cycle détecté",
      );
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Évaluation des conditions BRANCH (utilisé en runtime par WorkflowsService)
  // ---------------------------------------------------------------------------

  /**
   * Évalue une expression de condition simple sur un contexte (document ou
   * ticket à approuver). Le langage supporté est volontairement restreint
   * pour éviter une eval() arbitraire :
   *
   * Forme JSON attendue :
   *   { "field": "category", "op": "eq",  "value": "POLICY" }
   *   { "field": "amount",   "op": "gte", "value": 10000 }
   *   { "field": "tags",     "op": "in",  "value": ["urgent","RGPD"] }
   *   { "and": [<expr>, <expr>, …] }
   *   { "or":  [<expr>, <expr>, …] }
   *
   * Toute clé inconnue → false (par défaut, on ne valide pas).
   */
  evaluateCondition(
    condition: unknown,
    context: Record<string, unknown>,
  ): boolean {
    if (!condition || typeof condition !== "object") return true; // pas de condition = always true

    const c = condition as Record<string, unknown>;

    if (Array.isArray(c.and)) {
      return c.and.every((sub) => this.evaluateCondition(sub, context));
    }
    if (Array.isArray(c.or)) {
      return c.or.some((sub) => this.evaluateCondition(sub, context));
    }

    const field = typeof c.field === "string" ? c.field : null;
    const op = typeof c.op === "string" ? c.op : "eq";
    const value = c.value;

    if (!field) return false;
    const actual = context[field];

    switch (op) {
      case "eq":
        return actual === value;
      case "neq":
        return actual !== value;
      case "gt":
        return typeof actual === "number" && typeof value === "number" && actual > value;
      case "gte":
        return typeof actual === "number" && typeof value === "number" && actual >= value;
      case "lt":
        return typeof actual === "number" && typeof value === "number" && actual < value;
      case "lte":
        return typeof actual === "number" && typeof value === "number" && actual <= value;
      case "in":
        return Array.isArray(value) && (value as unknown[]).includes(actual);
      case "contains":
        return Array.isArray(actual) && (actual as unknown[]).includes(value);
      default:
        return false;
    }
  }

  /**
   * Calcule la liste des prochains step-ids depuis un step source.
   *
   * - APPROVAL / PARALLEL_* / DELEGATE : retourne `nextStepIds` brut
   *   (puis l'instance avance sur ces nodes).
   * - BRANCH : pour chaque sortant, vérifie sa condition (`condition` sur le
   *   step cible) ; ne retient que ceux qui matchent. Si aucune branche ne
   *   matche, retourne le premier sortant comme fallback "default".
   * - START : retourne le premier nextStepId, ou [].
   * - END : []
   */
  computeNextSteps(
    step: {
      id: string;
      type: WorkflowStepType;
      nextStepIds: string[];
    },
    allSteps: Array<{ id: string; condition: Prisma.JsonValue | null }>,
    context: Record<string, unknown>,
  ): string[] {
    if (step.type === "END") return [];
    if (!step.nextStepIds || step.nextStepIds.length === 0) return [];

    if (step.type === "BRANCH") {
      const matching: string[] = [];
      for (const targetId of step.nextStepIds) {
        const target = allSteps.find((s) => s.id === targetId);
        const cond = target?.condition ?? null;
        if (cond && this.evaluateCondition(cond as unknown, context)) {
          matching.push(targetId);
        }
      }
      // Si rien ne matche, on prend le 1er comme fallback (default)
      return matching.length > 0 ? matching : [step.nextStepIds[0]!];
    }

    return step.nextStepIds;
  }
}

// =============================================================================
// Types publics
// =============================================================================

export interface WorkflowGraph {
  workflowId: string;
  name: string;
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
}

export interface WorkflowGraphNode {
  id: string;
  type: WorkflowStepType;
  label: string;
  position: { x: number; y: number };
  data: WorkflowGraphNodeData;
}

export interface WorkflowGraphNodeData {
  order?: number;
  mode?: string;
  approverRole?: string | null;
  approverUserId?: string | null;
  approverDeptId?: string | null;
  approverUser?: { id: string; firstName: string; lastName: string; email: string } | null;
  approverDept?: { id: string; name: string; code: string } | null;
  slaHours?: number | null;
  minApprovers?: number;
  condition?: unknown;
  autoApproveOnTimeout?: boolean;
}

export interface WorkflowGraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface WorkflowGraphInput {
  nodes: Array<{
    id: string;
    type: WorkflowStepType;
    label: string;
    position?: { x: number; y: number };
    data?: Partial<WorkflowGraphNodeData>;
  }>;
  edges: WorkflowGraphEdgeInput[];
}

export interface WorkflowGraphEdgeInput {
  id?: string;
  source: string;
  target: string;
  label?: string;
}
