"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  Button,
  Input,
  Badge,
} from "@omnitech/ui";
import { Megaphone, Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";

interface Banner {
  id: string;
  title: string;
  message: string;
  level: string;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
  linkUrl?: string | null;
}

interface NewBannerForm {
  title: string;
  message: string;
  level: string;
  expiresAt: string;
  linkUrl: string;
}

const INITIAL_FORM: NewBannerForm = {
  title: "",
  message: "",
  level: "P3",
  expiresAt: "",
  linkUrl: "",
};

/**
 * Gestion des bannières prioritaires : création, liste, toggle active/inactive, suppression.
 * Inclut le champ linkUrl (feature récente V3-C).
 */
export function ConfigBannersSection() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [newBanner, setNewBanner] = useState<NewBannerForm>(INITIAL_FORM);
  const [creating, setCreating] = useState(false);

  const fetchBanners = () => {
    setLoading(true);
    api
      .get("/banners/all")
      .then(({ data }) =>
        setBanners(Array.isArray(data) ? data : data?.data || []),
      )
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchBanners();
  }, []);

  const handleCreate = async () => {
    if (!newBanner.title || !newBanner.message) {
      toast.error("Titre et message requis");
      return;
    }
    setCreating(true);
    try {
      await api.post("/banners", {
        title: newBanner.title,
        message: newBanner.message,
        level: newBanner.level,
        expiresAt: newBanner.expiresAt || undefined,
        linkUrl: newBanner.linkUrl?.trim() || undefined,
      });
      toast.success("Bannière créée");
      setNewBanner(INITIAL_FORM);
      fetchBanners();
    } catch {
      toast.error("Erreur lors de la création");
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      await api.patch(`/banners/${id}`, { isActive: !isActive });
      fetchBanners();
    } catch {
      toast.error("Erreur");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/banners/${id}`);
      toast.success("Bannière supprimée");
      fetchBanners();
    } catch {
      toast.error("Erreur");
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-seal-navy dark:text-blue-400" />
          <h2 className="text-sm font-semibold text-seal-navy dark:text-white">
            Bannières prioritaires
          </h2>
        </div>
      </CardHeader>
      <CardContent>
        {/* Create form */}
        <div className="mb-6 rounded-lg border border-gray-200 dark:border-slate-700 p-4 space-y-3">
          <h3 className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400 uppercase">
            Nouvelle bannière
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Input
              label="Titre"
              value={newBanner.title}
              onChange={(e) =>
                setNewBanner((p) => ({ ...p, title: e.target.value }))
              }
              placeholder="Titre de la bannière"
            />
            <Input
              label="Message"
              value={newBanner.message}
              onChange={(e) =>
                setNewBanner((p) => ({ ...p, message: e.target.value }))
              }
              placeholder="Contenu du message"
            />
            <div>
              <label className="block text-xs font-semibold text-seal-gray-500 dark:text-slate-400 mb-1.5">
                Niveau
              </label>
              <select
                aria-label="Niveau de la bannière"
                className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-seal-navy dark:text-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                value={newBanner.level}
                onChange={(e) =>
                  setNewBanner((p) => ({ ...p, level: e.target.value }))
                }
              >
                <option value="P1">P1 - Critique (rouge)</option>
                <option value="P2">P2 - Avertissement (ambre)</option>
                <option value="P3">P3 - Information (bleu)</option>
              </select>
            </div>
            <Input
              label="Expiration (optionnel)"
              type="datetime-local"
              value={newBanner.expiresAt}
              onChange={(e) =>
                setNewBanner((p) => ({ ...p, expiresAt: e.target.value }))
              }
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              label="Lien de redirection au clic (optionnel)"
              value={newBanner.linkUrl}
              onChange={(e) =>
                setNewBanner((p) => ({ ...p, linkUrl: e.target.value }))
              }
              placeholder="/quiz, /news/mon-article ou https://..."
            />
          </div>
          <Button size="sm" onClick={handleCreate} loading={creating}>
            <Plus className="h-4 w-4" />
            Créer la bannière
          </Button>
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-lg bg-gray-100 dark:bg-slate-800"
              />
            ))}
          </div>
        ) : banners.length === 0 ? (
          <p className="text-sm text-seal-gray-500 dark:text-slate-400 text-center py-4">
            Aucune bannière
          </p>
        ) : (
          <div className="space-y-2">
            {banners.map((b) => {
              const levelColors: Record<string, string> = {
                P1: "border-red-400 bg-red-50 dark:bg-red-900/20",
                P2: "border-amber-400 bg-amber-50 dark:bg-amber-900/20",
                P3: "border-blue-400 bg-blue-50 dark:bg-blue-900/20",
              };
              return (
                <div
                  key={b.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 ${levelColors[b.level] || levelColors.P3}`}
                >
                  <Badge
                    variant={
                      b.level === "P1"
                        ? "error"
                        : b.level === "P2"
                          ? "warning"
                          : "success"
                    }
                  >
                    {b.level}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-seal-navy dark:text-white truncate">
                      {b.title}
                    </p>
                    <p className="text-xs text-seal-gray-500 dark:text-slate-400 truncate">
                      {b.message}
                    </p>
                  </div>
                  {!b.isActive && <Badge variant="draft">Inactive</Badge>}
                  {b.expiresAt && (
                    <span className="text-[10px] text-seal-gray-500 dark:text-slate-400">
                      Exp: {new Date(b.expiresAt).toLocaleDateString("fr-FR")}
                    </span>
                  )}
                  <button
                    onClick={() => handleToggle(b.id, b.isActive)}
                    className="text-seal-gray-500 hover:text-seal-navy dark:hover:text-white transition-colors"
                    title={b.isActive ? "Désactiver" : "Activer"}
                    aria-label={
                      b.isActive
                        ? "Désactiver le bandeau"
                        : "Activer le bandeau"
                    }
                  >
                    {b.isActive ? (
                      <ToggleRight className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <ToggleLeft className="h-5 w-5" />
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(b.id)}
                    className="text-seal-gray-500 hover:text-red-500 transition-colors"
                    title="Supprimer"
                    aria-label="Supprimer le bandeau"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
