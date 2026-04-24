"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuthStore, type AuthUser } from "@/stores/auth-store";
import { USER_ROLE_LABELS } from "@omnitech/shared";
import { Card, CardContent, Button, Avatar, Badge } from "@omnitech/ui";
import { getInitials, formatDate, formatRelativeTime } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { getAvatarUrl } from "@/lib/avatar";
import {
  Shield,
  Clock,
  Camera,
  MapPin,
  Globe,
  MessageSquare,
  PenLine,
} from "lucide-react";
import { SKILL_COLORS, type ApiError, type ProfileData } from "./types";

interface ProfileHeaderProps {
  user: AuthUser;
  profile: ProfileData | null;
  myDocs: number;
  unreadNotifCount: number;
  parsedSkills: string[];
  parsedLanguages: string[];
  onOpenEditModal: () => void;
}

export function ProfileHeader({
  user,
  profile,
  myDocs,
  unreadNotifCount,
  parsedSkills,
  parsedLanguages,
  onOpenEditModal,
}: ProfileHeaderProps) {
  const setUser = useAuthStore((s) => s.setUser);
  const { t } = useTranslation();
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error(t("profile.photoFormats"));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t("profile.photoMaxSize"));
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setAvatarPreview(previewUrl);

    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("avatar", file);
      const { data } = await api.post("/users/me/avatar", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (user) {
        setUser({ ...user, avatarUrl: data.avatarUrl });
      }
      toast.success(t("profile.photoUpdated"));
      URL.revokeObjectURL(previewUrl);
      setAvatarPreview(null);
    } catch (err) {
      toast.error(
        (err as ApiError)?.response?.data?.message ||
          (err as ApiError)?.message ||
          t("profile.photoError"),
      );
      URL.revokeObjectURL(previewUrl);
      setAvatarPreview(null);
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="h-24 bg-gradient-to-r from-seal-navy via-seal-navy/80 to-primary/60 relative">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImEiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCI+PHBhdGggZD0iTTAgMGg2MHY2MEgweiIgZmlsbD0ibm9uZSIvPjxjaXJjbGUgY3g9IjMwIiBjeT0iMzAiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4xKSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNhKSIvPjwvc3ZnPg==')] opacity-30" />
      </div>
      <CardContent className="-mt-12 relative">
        <div className="flex items-end gap-5">
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleAvatarUpload}
          />
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="relative group cursor-pointer flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full"
            title={t("profile.changePhoto")}
            aria-label={t("profile.changePhoto")}
          >
            {avatarPreview || user.avatarUrl ? (
              <Avatar
                src={avatarPreview || getAvatarUrl(user.avatarUrl!)}
                initials={getInitials(user.firstName, user.lastName)}
                size="lg"
                className="h-28 w-28 text-3xl ring-4 ring-white dark:ring-slate-900 shadow-lg"
              />
            ) : (
              <div className="flex h-28 w-28 items-center justify-center rounded-full bg-primary text-white text-3xl font-semibold shadow-lg ring-4 ring-white dark:ring-slate-900">
                {user.firstName.charAt(0)}
                {user.lastName.charAt(0)}
              </div>
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              {uploadingAvatar ? (
                <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Camera className="h-5 w-5 text-white" />
                  <span className="text-[9px] text-white font-medium mt-0.5">
                    Changer la photo
                  </span>
                </>
              )}
            </div>
          </button>
          <div className="flex-1 min-w-0 pb-1">
            {!user.avatarUrl && !avatarPreview && (
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="mb-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors"
              >
                <Camera className="h-3.5 w-3.5" />
                Ajouter une photo de profil
              </button>
            )}
            <h1 className="text-2xl font-medium text-seal-navy dark:text-white">
              {user.firstName} {user.lastName}
            </h1>
            {user.jobTitle && (
              <p className="text-sm text-seal-gray-500 dark:text-slate-400">
                {user.jobTitle}
              </p>
            )}
            <p className="text-sm text-seal-gray-500 dark:text-slate-400">
              {user.email}
            </p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold text-white bg-gradient-to-r from-primary to-primary/80 shadow-sm">
                <Shield className="h-3.5 w-3.5" />
                {USER_ROLE_LABELS[user.role]}
              </span>
              {user.departmentName && (
                <Badge variant="navy">{user.departmentName}</Badge>
              )}
              {user.location && (
                <span className="inline-flex items-center gap-1 text-[11px] text-seal-gray-500 dark:text-slate-400">
                  <MapPin className="h-3 w-3" /> {user.location}
                </span>
              )}
              {profile?.lastLoginAt && (
                <span className="inline-flex items-center gap-1 text-[11px] text-seal-gray-500 dark:text-slate-400">
                  <Clock className="h-3 w-3" /> Dernière connexion :{" "}
                  {formatRelativeTime(profile.lastLoginAt)}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 pb-1 flex-shrink-0">
            {(user.teamsLink || user.email) && (
              <a
                href={
                  user.teamsLink ||
                  `ms-teams://l/chat/0/0?users=${encodeURIComponent(user.email)}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#6264A7] hover:bg-[#525498] rounded-lg transition-colors"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Teams
              </a>
            )}
            <Button variant="outline" size="sm" onClick={onOpenEditModal}>
              <PenLine className="h-3.5 w-3.5" /> Modifier
            </Button>
          </div>
        </div>

        {(parsedSkills.length > 0 || parsedLanguages.length > 0) && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700">
            {parsedSkills.length > 0 && (
              <div className="mb-2">
                <p className="text-[10px] font-medium text-seal-gray-500 dark:text-slate-500 uppercase tracking-widest mb-2">
                  Compétences
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {parsedSkills.map((skill: string, i: number) => (
                    <span
                      key={skill}
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${SKILL_COLORS[i % SKILL_COLORS.length]}`}
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {parsedLanguages.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-seal-gray-500 dark:text-slate-500 uppercase tracking-widest mb-2">
                  Langues
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {parsedLanguages.map((lang: string) => (
                    <span
                      key={lang}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-slate-800 text-seal-navy dark:text-white border border-gray-200 dark:border-slate-700"
                    >
                      <Globe className="h-3 w-3 text-seal-gray-500" /> {lang}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-100 dark:border-slate-700">
          <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-slate-800">
            <p className="text-3xl font-bold text-seal-navy dark:text-white">
              {myDocs}
            </p>
            <p className="text-[10px] text-seal-gray-500 dark:text-slate-400 mb-1.5">
              Documents
            </p>
            <div className="h-1 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-500"
                style={{ width: `${Math.min(100, myDocs * 2)}%` }}
              />
            </div>
          </div>
          <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-slate-800">
            <p className="text-3xl font-bold text-seal-navy dark:text-white">
              {unreadNotifCount}
            </p>
            <p className="text-[10px] text-seal-gray-500 dark:text-slate-400 mb-1.5">
              Notifications
            </p>
            <div className="h-1 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-500 transition-all duration-500"
                style={{ width: `${Math.min(100, unreadNotifCount * 10)}%` }}
              />
            </div>
          </div>
          <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-slate-800">
            <p className="text-lg font-bold text-seal-navy dark:text-white">
              {user.createdAt ? formatDate(user.createdAt) : "—"}
            </p>
            <p className="text-[10px] text-seal-gray-500 dark:text-slate-400">
              Membre depuis
            </p>
          </div>
          <div
            className={`text-center p-3 rounded-lg ${profile?.mfaEnabled ? "bg-emerald-50 dark:bg-emerald-900/20" : "bg-amber-50 dark:bg-amber-900/20"}`}
          >
            <p
              className={`text-3xl font-bold ${profile?.mfaEnabled ? "text-emerald-600" : "text-amber-600"}`}
            >
              {profile?.mfaEnabled ? "✓" : "!"}
            </p>
            <p className="text-[10px] text-seal-gray-500 dark:text-slate-400">
              MFA {profile?.mfaEnabled ? "Actif" : "Inactif"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
