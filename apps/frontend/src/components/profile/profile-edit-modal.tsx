"use client";

import React from "react";
import { Button, Input } from "@omnitech/ui";
import {
  Save,
  PenLine,
  X,
  Phone,
  MapPin,
  Tags,
  Globe,
  Link2,
} from "lucide-react";
import { SKILL_COLORS } from "./types";

interface ProfileEditModalProps {
  open: boolean;
  onClose: () => void;
  editPhone: string;
  setEditPhone: (v: string) => void;
  editLocation: string;
  setEditLocation: (v: string) => void;
  editSkills: string;
  setEditSkills: (v: string) => void;
  editLanguages: string;
  setEditLanguages: (v: string) => void;
  editTeamsLink: string;
  setEditTeamsLink: (v: string) => void;
  savingProfile: boolean;
  onSave: () => void;
}

export function ProfileEditModal({
  open,
  onClose,
  editPhone,
  setEditPhone,
  editLocation,
  setEditLocation,
  editSkills,
  setEditSkills,
  editLanguages,
  setEditLanguages,
  editTeamsLink,
  setEditTeamsLink,
  savingProfile,
  onSave,
}: ProfileEditModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in-scale"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        ref={(el) => {
          if (el) {
            requestAnimationFrame(() => {
              const input = el.querySelector<HTMLElement>(
                'input:not([type="hidden"]):not([disabled])',
              );
              input?.focus();
            });
          }
        }}
        className="bg-white dark:bg-slate-900 rounded-xl p-6 max-w-md w-full mx-4 shadow-xl max-h-[85vh] overflow-y-auto animate-fade-in-scale"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-seal-navy dark:text-white flex items-center gap-2">
            <PenLine className="h-5 w-5 text-primary" />
            Modifier mon profil
          </h3>
          <button
            onClick={onClose}
            title="Fermer"
            aria-label="Fermer la fenêtre de modification du profil"
            className="p-1.5 rounded-lg text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400 flex items-center gap-1.5 mb-1">
              <Phone className="h-3.5 w-3.5" /> Téléphone
            </label>
            <Input
              value={editPhone}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setEditPhone(e.target.value)
              }
              placeholder="+33 1 23 45 67 89"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400 flex items-center gap-1.5 mb-1">
              <MapPin className="h-3.5 w-3.5" /> Localisation / Bureau
            </label>
            <Input
              value={editLocation}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setEditLocation(e.target.value)
              }
              placeholder="Bureau 301, Paris"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400 flex items-center gap-1.5 mb-1">
              <Tags className="h-3.5 w-3.5" /> Compétences (séparées par des
              virgules)
            </label>
            <Input
              value={editSkills}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setEditSkills(e.target.value)
              }
              placeholder="Cybersécurité, ISO 27001, Audit"
            />
            {editSkills && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {editSkills
                  .split(",")
                  .map((s: string) => s.trim())
                  .filter(Boolean)
                  .map((skill: string, i: number) => (
                    <span
                      key={skill}
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${SKILL_COLORS[i % SKILL_COLORS.length]}`}
                    >
                      {skill}
                    </span>
                  ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400 flex items-center gap-1.5 mb-1">
              <Globe className="h-3.5 w-3.5" /> Langues (séparées par des
              virgules)
            </label>
            <Input
              value={editLanguages}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setEditLanguages(e.target.value)
              }
              placeholder="Français, Anglais, Espagnol"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400 flex items-center gap-1.5 mb-1">
              <Link2 className="h-3.5 w-3.5" /> Lien Teams
            </label>
            <Input
              value={editTeamsLink}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setEditTeamsLink(e.target.value)
              }
              placeholder="https://teams.microsoft.com/l/chat/..."
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100 dark:border-slate-700">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            onClick={() => {
              onSave();
              onClose();
            }}
            loading={savingProfile}
            disabled={savingProfile}
          >
            <Save className="h-4 w-4" />
            {savingProfile ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </div>
    </div>
  );
}
