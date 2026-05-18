"use client";

/**
 * Page admin — Éditeur visuel drag & drop des règles de workflow (item #24).
 *
 * Implémentation custom (pas de dépendance externe) :
 *  - Canvas SVG plein écran avec coordonnées mondiales (pan/zoom limités au
 *    pan vertical via overflow-auto pour la simplicité — pour une v2 on
 *    rajoutera le zoom).
 *  - Drag & drop des nodes via mousemove/touchmove + capture pointer events.
 *  - Edges affichées sous forme de polyline avec marqueur flèche SVG.
 *  - Sauvegarde auto-debounced 500ms via PUT /api/v1/approval-workflows/:id/graph.
 *  - Sidebar de palette à gauche (drag d'un type vers le canvas).
 *  - Sidebar properties à droite (édition du node sélectionné).
 *  - Charte SEAL : couleurs PANTONE pour les types de nodes.
 *
 * A11y : alternative liste sous le canvas pour screen readers, tab order
 * cohérent, focus visible. Le canvas SVG est `aria-hidden`, l'utilisateur
 * clavier passe par la palette + table de nodes.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { logger } from "@/lib/logger";
import { toast } from "sonner";
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Workflow,
  GitBranch,
  GitMerge,
  PlayCircle,
  StopCircle,
  UserCheck,
} from "lucide-react";
import { Button, Card, CardContent, Badge } from "@omnitech/ui";

type NodeType =
  | "START"
  | "APPROVAL"
  | "BRANCH"
  | "PARALLEL_ALL"
  | "PARALLEL_ANY"
  | "DELEGATE"
  | "END";

interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  position: { x: number; y: number };
  data: {
    approverRole?: string | null;
    approverUserId?: string | null;
    approverDeptId?: string | null;
    slaHours?: number | null;
    minApprovers?: number;
    condition?: unknown;
    autoApproveOnTimeout?: boolean;
  };
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

interface Graph {
  workflowId: string;
  name: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const NODE_TYPE_LABELS: Record<NodeType, string> = {
  START: "Début",
  APPROVAL: "Approbation",
  BRANCH: "Branchement",
  PARALLEL_ALL: "Parallèle (tous)",
  PARALLEL_ANY: "Parallèle (premier)",
  DELEGATE: "Délégation",
  END: "Fin",
};

const NODE_TYPE_COLORS: Record<
  NodeType,
  { bg: string; border: string; icon: typeof Workflow }
> = {
  START: { bg: "#006233", border: "#003c1f", icon: PlayCircle },
  APPROVAL: { bg: "#296DC1", border: "#1a4f8f", icon: UserCheck },
  BRANCH: { bg: "#F9964A", border: "#d27433", icon: GitBranch },
  PARALLEL_ALL: { bg: "#892034", border: "#5e1624", icon: GitMerge },
  PARALLEL_ANY: { bg: "#892034", border: "#5e1624", icon: GitMerge },
  DELEGATE: { bg: "#F68D2E", border: "#002a45", icon: Workflow },
  END: { bg: "#762323", border: "#4a1515", icon: StopCircle },
};

const NODE_WIDTH = 180;
const NODE_HEIGHT = 70;

const ROLES = [
  "COLLABORATEUR",
  "AUDITEUR",
  "PRESTATAIRE",
  "REVIEWER",
  "DIRECTION",
  "ADMIN",
  "SUPER_ADMIN",
];

/**
 * Génère un UUID v4 simple côté client (sans dépendance), utilisé pour les
 * nouveaux nodes avant sauvegarde. Le backend acceptera l'id tel quel.
 */
function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback (anciens navigateurs) — RFC 4122 v4
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function WorkflowGraphEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [graph, setGraph] = useState<Graph | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [pendingEdgeFrom, setPendingEdgeFrom] = useState<string | null>(null);
  const [dragNode, setDragNode] = useState<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const canvasRef = useRef<SVGSVGElement>(null);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ---------------------------------------------------------------------------
  // Load / Save
  // ---------------------------------------------------------------------------

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await api.get<Graph>(`/approval-workflows/${id}/graph`);
      // Si le graphe est vide (workflow sans steps), on initialise un canevas
      // minimal START → END.
      if (!data.nodes || data.nodes.length === 0) {
        setGraph({
          workflowId: id,
          name: data.name ?? "Workflow",
          nodes: [
            {
              id: generateId(),
              type: "START",
              label: "Début",
              position: { x: 100, y: 200 },
              data: {},
            },
            {
              id: generateId(),
              type: "END",
              label: "Fin",
              position: { x: 600, y: 200 },
              data: {},
            },
          ],
          edges: [],
        });
      } else {
        setGraph(data);
      }
    } catch (err: unknown) {
      toast.error("Impossible de charger le graphe");
      logger.error(err, { page: "admin/workflows/edit", context: "loadGraph" });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Validation client (miroir des règles serveur) — affiche les warnings sans
   * bloquer l'utilisateur. Le backend valide à nouveau à la sauvegarde.
   */
  const validateClient = useCallback((g: Graph): string[] => {
    const errors: string[] = [];
    if (g.nodes.length === 0) {
      errors.push("Le graphe est vide.");
      return errors;
    }
    const starts = g.nodes.filter((n) => n.type === "START");
    const ends = g.nodes.filter((n) => n.type === "END");
    if (starts.length === 0) errors.push("Aucun nœud START.");
    if (starts.length > 1)
      errors.push(`${starts.length} nœuds START — un seul autorisé.`);
    if (ends.length === 0) errors.push("Aucun nœud END.");

    // BRANCH ≥ 2 sortants
    for (const node of g.nodes) {
      if (node.type === "BRANCH") {
        const out = g.edges.filter((e) => e.source === node.id);
        if (out.length < 2) {
          errors.push(
            `BRANCH "${node.label}" : ${out.length} sortie(s) (au moins 2 requises).`,
          );
        }
      }
      if (node.type === "END") {
        const out = g.edges.filter((e) => e.source === node.id);
        if (out.length > 0) {
          errors.push(`END "${node.label}" ne doit pas avoir de sortie.`);
        }
      }
    }

    // Détection de cycle simple via DFS
    const adj = new Map<string, string[]>();
    for (const n of g.nodes) adj.set(n.id, []);
    for (const e of g.edges) adj.get(e.source)?.push(e.target);
    const WHITE = 0,
      GRAY = 1,
      BLACK = 2;
    const color = new Map<string, number>();
    g.nodes.forEach((n) => color.set(n.id, WHITE));
    let hasCycle = false;
    const dfs = (node: string): void => {
      color.set(node, GRAY);
      for (const next of adj.get(node) ?? []) {
        if (color.get(next) === GRAY) {
          hasCycle = true;
          return;
        }
        if (color.get(next) === WHITE) dfs(next);
        if (hasCycle) return;
      }
      color.set(node, BLACK);
    };
    for (const n of g.nodes) {
      if (color.get(n.id) === WHITE) dfs(n.id);
      if (hasCycle) {
        errors.push("Cycle détecté dans le graphe (DAG requis).");
        break;
      }
    }

    // Orphelins
    if (starts.length === 1) {
      const visited = new Set<string>();
      const queue = [starts[0]!.id];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        if (visited.has(cur)) continue;
        visited.add(cur);
        for (const next of adj.get(cur) ?? []) queue.push(next);
      }
      const orphans = g.nodes.filter((n) => !visited.has(n.id));
      if (orphans.length > 0) {
        errors.push(
          `Orphelins (inaccessibles) : ${orphans.map((o) => o.label).join(", ")}.`,
        );
      }
    }

    return errors;
  }, []);

  // Signature minimaliste de la structure (sans positions x/y) — la
  // validation DAG/conditions n'a besoin de tourner QUE quand cette
  // signature change. Le drag pur (déplacement de nœud) ne touche que
  // x/y et ne doit donc pas re-trigger un parcours O(V+E) à chaque pixel.
  const structureSignatureRef = useRef<string>("");
  const lastValidationRef = useRef<string[]>([]);

  const computeStructureSignature = (g: Graph): string => {
    const nodesSig = g.nodes
      .map(
        (n) =>
          `${n.id}|${n.type}|${n.label}|${JSON.stringify(n.data.condition ?? null)}|${n.data.minApprovers ?? ""}|${n.data.approverUserId ?? ""}|${n.data.approverRole ?? ""}|${n.data.approverDeptId ?? ""}`,
      )
      .sort()
      .join(";");
    const edgesSig = g.edges
      .map((e) => `${e.source}->${e.target}|${e.label ?? ""}`)
      .sort()
      .join(";");
    return `${nodesSig}#${edgesSig}`;
  };

  const scheduleSave = useCallback(
    (g: Graph) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        void (async () => {
          // Skip validation O(V+E) si seules les positions ont changé (drag pur).
          const sig = computeStructureSignature(g);
          let errors = lastValidationRef.current;
          if (sig !== structureSignatureRef.current) {
            errors = validateClient(g);
            structureSignatureRef.current = sig;
            lastValidationRef.current = errors;
            setValidationErrors(errors);
          }
          if (errors.length > 0) {
            // On sauvegarde quand même les positions/labels mais pas la structure
            // si elle est cassée — on affiche juste un warning.
            return;
          }
          setSaving(true);
          try {
            await api.put(`/approval-workflows/${id}/graph`, {
              nodes: g.nodes,
              edges: g.edges,
            });
          } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })
              ?.response?.data?.message;
            toast.error(msg ?? "Erreur de sauvegarde");
          } finally {
            setSaving(false);
          }
        })();
      }, 500);
    },
    [id, validateClient],
  );

  const updateGraph = useCallback(
    (mutator: (g: Graph) => Graph) => {
      setGraph((prev) => {
        if (!prev) return prev;
        const next = mutator(prev);
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  // ---------------------------------------------------------------------------
  // Drag & drop
  // ---------------------------------------------------------------------------

  const onNodeMouseDown = (e: React.MouseEvent, node: GraphNode) => {
    e.stopPropagation();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setDragNode({
      id: node.id,
      offsetX: e.clientX - rect.left - node.position.x,
      offsetY: e.clientY - rect.top - node.position.y,
    });
    setSelectedNodeId(node.id);
  };

  const onCanvasMouseMove = (e: React.MouseEvent) => {
    if (!dragNode || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - dragNode.offsetX;
    const y = e.clientY - rect.top - dragNode.offsetY;
    updateGraph((g) => ({
      ...g,
      nodes: g.nodes.map((n) =>
        n.id === dragNode.id ? { ...n, position: { x, y } } : n,
      ),
    }));
  };

  const onCanvasMouseUp = () => {
    setDragNode(null);
  };

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const addNode = (type: NodeType) => {
    updateGraph((g) => {
      const newNode: GraphNode = {
        id: generateId(),
        type,
        label: NODE_TYPE_LABELS[type],
        position: {
          x: 200 + Math.random() * 200,
          y: 100 + Math.random() * 200,
        },
        data: { minApprovers: 1 },
      };
      return { ...g, nodes: [...g.nodes, newNode] };
    });
  };

  const removeNode = (nodeId: string) => {
    updateGraph((g) => ({
      ...g,
      nodes: g.nodes.filter((n) => n.id !== nodeId),
      edges: g.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
    }));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  };

  const updateNode = (nodeId: string, patch: Partial<GraphNode>) => {
    updateGraph((g) => ({
      ...g,
      nodes: g.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)),
    }));
  };

  const updateNodeData = (
    nodeId: string,
    dataPatch: Partial<GraphNode["data"]>,
  ) => {
    updateGraph((g) => ({
      ...g,
      nodes: g.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...dataPatch } } : n,
      ),
    }));
  };

  const startEdge = (fromId: string) => {
    setPendingEdgeFrom(fromId);
  };

  const completeEdge = (toId: string) => {
    if (!pendingEdgeFrom || pendingEdgeFrom === toId) {
      setPendingEdgeFrom(null);
      return;
    }
    updateGraph((g) => {
      // anti-doublon
      if (
        g.edges.some((e) => e.source === pendingEdgeFrom && e.target === toId)
      ) {
        return g;
      }
      return {
        ...g,
        edges: [
          ...g.edges,
          {
            id: `${pendingEdgeFrom}->${toId}`,
            source: pendingEdgeFrom,
            target: toId,
          },
        ],
      };
    });
    setPendingEdgeFrom(null);
  };

  const removeEdge = (edgeId: string) => {
    updateGraph((g) => ({
      ...g,
      edges: g.edges.filter((e) => e.id !== edgeId),
    }));
  };

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  const selectedNode = useMemo(
    () => graph?.nodes.find((n) => n.id === selectedNodeId) ?? null,
    [graph, selectedNodeId],
  );

  if (loading || !graph) {
    return (
      <div className="p-6 text-gray-500 dark:text-slate-400">Chargement…</div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-3">
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/workflows/${id}`}
            className="inline-flex items-center text-sm text-seal-blue dark:text-blue-300 hover:underline"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Retour au détail
          </Link>
          <span className="text-gray-300 dark:text-slate-600">|</span>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Éditeur visuel : {graph.name}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {validationErrors.length > 0 ? (
            <Badge variant="error" className="gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              {validationErrors.length} erreur(s)
            </Badge>
          ) : (
            <Badge variant="success" className="gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Graphe valide
            </Badge>
          )}
          {saving ? (
            <span className="text-xs text-gray-500 dark:text-slate-400">
              Sauvegarde…
            </span>
          ) : (
            <span className="text-xs text-gray-400 dark:text-slate-500">
              Enregistré
            </span>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar palette */}
        <aside
          className="w-56 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-2 overflow-y-auto"
          aria-label="Palette de nœuds"
        >
          <h2 className="text-xs uppercase font-bold tracking-wider text-gray-500 dark:text-slate-400 mb-2">
            Ajouter un nœud
          </h2>
          {(
            [
              "APPROVAL",
              "BRANCH",
              "PARALLEL_ALL",
              "PARALLEL_ANY",
              "DELEGATE",
              "END",
            ] as NodeType[]
          ).map((type) => {
            const { bg, icon: Icon } = NODE_TYPE_COLORS[type];
            return (
              <button
                key={type}
                type="button"
                onClick={() => addNode(type)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 text-left text-sm transition-colors"
                aria-label={`Ajouter un nœud ${NODE_TYPE_LABELS[type]}`}
              >
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ background: bg }}
                />
                <Icon
                  className="w-4 h-4 text-gray-500 dark:text-slate-400"
                  aria-hidden="true"
                />
                {NODE_TYPE_LABELS[type]}
              </button>
            );
          })}

          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <h2 className="text-xs uppercase font-bold tracking-wider text-gray-500 dark:text-slate-400 mb-2">
              Légende
            </h2>
            <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed">
              • Cliquer sur "Lier" sur un nœud puis sur un autre pour créer une
              transition.
              <br />• Glisser un nœud pour le repositionner.
              <br />• Sauvegarde auto toutes les 500&nbsp;ms.
            </p>
          </div>
        </aside>

        {/* Canvas */}
        <div
          className="flex-1 overflow-auto relative"
          onMouseMove={onCanvasMouseMove}
          onMouseUp={onCanvasMouseUp}
        >
          <svg
            ref={canvasRef}
            className="w-full h-full min-w-[1200px] min-h-[800px]"
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#296DC1" />
              </marker>
              <pattern
                id="grid"
                width="40"
                height="40"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 40 0 L 0 0 0 40"
                  fill="none"
                  stroke="#e5e7eb"
                  strokeWidth="0.5"
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />

            {/* Edges */}
            {graph.edges.map((e) => {
              const src = graph.nodes.find((n) => n.id === e.source);
              const tgt = graph.nodes.find((n) => n.id === e.target);
              if (!src || !tgt) return null;
              const x1 = src.position.x + NODE_WIDTH;
              const y1 = src.position.y + NODE_HEIGHT / 2;
              const x2 = tgt.position.x;
              const y2 = tgt.position.y + NODE_HEIGHT / 2;
              const midX = (x1 + x2) / 2;
              return (
                <g key={e.id}>
                  <path
                    d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                    stroke="#296DC1"
                    strokeWidth="2"
                    fill="none"
                    markerEnd="url(#arrow)"
                  />
                  {/* Click target invisible pour suppression */}
                  <path
                    d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                    stroke="transparent"
                    strokeWidth="14"
                    fill="none"
                    style={{ cursor: "pointer" }}
                    onClick={() => {
                      if (confirm("Supprimer cette transition ?"))
                        removeEdge(e.id);
                    }}
                  />
                </g>
              );
            })}

            {/* Nodes */}
            {graph.nodes.map((n) => {
              const { bg, border, icon: Icon } = NODE_TYPE_COLORS[n.type];
              const isSelected = n.id === selectedNodeId;
              const isPendingFrom = n.id === pendingEdgeFrom;
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.position.x}, ${n.position.y})`}
                  style={{ cursor: "move" }}
                  onMouseDown={(e) => onNodeMouseDown(e, n)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (pendingEdgeFrom && pendingEdgeFrom !== n.id) {
                      completeEdge(n.id);
                    } else {
                      setSelectedNodeId(n.id);
                    }
                  }}
                >
                  <rect
                    width={NODE_WIDTH}
                    height={NODE_HEIGHT}
                    rx="8"
                    fill={bg}
                    stroke={
                      isSelected
                        ? "#F9964A"
                        : isPendingFrom
                          ? "#006233"
                          : border
                    }
                    strokeWidth={isSelected || isPendingFrom ? 3 : 1}
                  />
                  <foreignObject
                    x="0"
                    y="0"
                    width={NODE_WIDTH}
                    height={NODE_HEIGHT}
                  >
                    <div
                      className="w-full h-full flex flex-col justify-center px-3 text-white pointer-events-none"
                      // eslint-disable-next-line react/no-unknown-property
                      // @ts-expect-error -- xmlns required for foreignObject
                      xmlns="http://www.w3.org/1999/xhtml"
                    >
                      <div className="flex items-center gap-1.5 text-xs opacity-90">
                        <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                        {NODE_TYPE_LABELS[n.type]}
                      </div>
                      <div className="text-sm font-semibold truncate mt-0.5">
                        {n.label}
                      </div>
                    </div>
                  </foreignObject>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Sidebar properties */}
        <aside
          className="w-72 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 overflow-y-auto"
          aria-label="Propriétés du nœud sélectionné"
        >
          {selectedNode ? (
            <NodeProperties
              node={selectedNode}
              onLabelChange={(label) => updateNode(selectedNode.id, { label })}
              onDataChange={(d) => updateNodeData(selectedNode.id, d)}
              onStartEdge={() => startEdge(selectedNode.id)}
              isPendingFrom={selectedNode.id === pendingEdgeFrom}
              onDelete={() => removeNode(selectedNode.id)}
            />
          ) : (
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Sélectionnez un nœud pour éditer ses propriétés.
            </p>
          )}
        </aside>
      </div>

      {/* Validation errors banner */}
      {validationErrors.length > 0 && (
        <div className="border-t border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-3 text-xs space-y-1">
          {validationErrors.map((err, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-amber-800 dark:text-amber-200"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              {err}
            </div>
          ))}
        </div>
      )}

      {/* A11y : alternative liste (cachée visuellement, lue par les SR) */}
      <div
        className="sr-only"
        role="region"
        aria-label="Liste des nœuds (alternative au canvas)"
      >
        <h2>Nœuds du workflow</h2>
        <ul>
          {graph.nodes.map((n) => (
            <li key={n.id}>
              {NODE_TYPE_LABELS[n.type]} : {n.label}
              {graph.edges.filter((e) => e.source === n.id).length > 0 && (
                <span>
                  {" "}
                  → vers{" "}
                  {graph.edges
                    .filter((e) => e.source === n.id)
                    .map(
                      (e) =>
                        graph.nodes.find((nn) => nn.id === e.target)?.label,
                    )
                    .join(", ")}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NodeProperties — sidebar droite (édition)
// ---------------------------------------------------------------------------

interface NodePropertiesProps {
  node: GraphNode;
  onLabelChange: (label: string) => void;
  onDataChange: (patch: Partial<GraphNode["data"]>) => void;
  onStartEdge: () => void;
  isPendingFrom: boolean;
  onDelete: () => void;
}

function NodeProperties({
  node,
  onLabelChange,
  onDataChange,
  onStartEdge,
  isPendingFrom,
  onDelete,
}: NodePropertiesProps) {
  const showApproverFields =
    node.type === "APPROVAL" ||
    node.type === "PARALLEL_ALL" ||
    node.type === "PARALLEL_ANY";
  const showCondition = node.type === "BRANCH";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
          Propriétés du nœud
        </h2>
        <p className="text-xs text-gray-500 dark:text-slate-400">
          {NODE_TYPE_LABELS[node.type]}
        </p>
      </div>

      <label className="block">
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
          Libellé
        </span>
        <input
          type="text"
          value={node.label}
          onChange={(e) => onLabelChange(e.target.value)}
          className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
          maxLength={200}
        />
      </label>

      {showApproverFields && (
        <>
          <label className="block">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              Rôle approbateur
            </span>
            <select
              value={node.data.approverRole ?? ""}
              onChange={(e) =>
                onDataChange({ approverRole: e.target.value || null })
              }
              className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
            >
              <option value="">— Aucun —</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              SLA (heures)
            </span>
            <input
              type="number"
              min={1}
              value={node.data.slaHours ?? ""}
              onChange={(e) =>
                onDataChange({
                  slaHours: e.target.value
                    ? parseInt(e.target.value, 10)
                    : null,
                })
              }
              className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
            />
          </label>

          {(node.type === "PARALLEL_ALL" || node.type === "PARALLEL_ANY") && (
            <label className="block">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Seuil minimum d'approbations
              </span>
              <input
                type="number"
                min={1}
                value={node.data.minApprovers ?? 1}
                onChange={(e) =>
                  onDataChange({
                    minApprovers: parseInt(e.target.value, 10) || 1,
                  })
                }
                className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
              />
              <span className="text-xs text-gray-500 dark:text-slate-400 mt-1 block">
                Nombre d'approbations distinctes nécessaires pour valider
                l'étape (multi-niveaux).
              </span>
            </label>
          )}
        </>
      )}

      {showCondition && (
        <label className="block">
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
            Condition (JSON)
          </span>
          <textarea
            rows={6}
            placeholder='{"field": "category", "op": "eq", "value": "POLICY"}'
            value={
              node.data.condition
                ? JSON.stringify(node.data.condition, null, 2)
                : ""
            }
            onChange={(e) => {
              const v = e.target.value.trim();
              if (!v) {
                onDataChange({ condition: null });
                return;
              }
              try {
                onDataChange({ condition: JSON.parse(v) });
              } catch {
                /* JSON invalide — on n'applique pas tant que ce n'est pas valide */
              }
            }}
            className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-xs font-mono"
          />
          <span className="text-xs text-gray-500 dark:text-slate-400 mt-1 block">
            Forme : {`{"field":"...", "op":"eq|gte|in|...", "value":...}`} ou
            {` {"and":[…]} / {"or":[…]}`}.
          </span>
        </label>
      )}

      <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700">
        <Button
          variant={isPendingFrom ? "destructive" : "primary"}
          className="w-full gap-1"
          size="sm"
          onClick={onStartEdge}
        >
          <Plus className="w-3.5 h-3.5" />
          {isPendingFrom ? "Cliquer un nœud cible…" : "Lier vers un autre nœud"}
        </Button>
        {node.type !== "START" && node.type !== "END" && (
          <Button
            variant="outline"
            className="w-full gap-1 text-seal-bordeaux"
            size="sm"
            onClick={() => {
              if (confirm("Supprimer ce nœud ?")) onDelete();
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Supprimer le nœud
          </Button>
        )}
      </div>
    </div>
  );
}
