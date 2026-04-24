"use client";

import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useNotificationStore } from "@/stores/notification-store";
import { useTranslation } from "@/lib/i18n";

import { ProfileHeader } from "@/components/profile/profile-header";
import { ProfileEditModal } from "@/components/profile/profile-edit-modal";
import { ProfilePersonalInfo } from "@/components/profile/profile-personal-info";
import { ProfileManagerTeam } from "@/components/profile/profile-manager-team";
import { ProfileSecuritySection } from "@/components/profile/profile-security-section";
import { ProfileChangePassword } from "@/components/profile/profile-change-password";
import { ProfilePreferencesSection } from "@/components/profile/profile-preferences-section";
import { ProfileRgpdSection } from "@/components/profile/profile-rgpd-section";
import { ProfileActivitySection } from "@/components/profile/profile-activity-section";
import { ProfileDocumentsSection } from "@/components/profile/profile-documents-section";
import { ProfileTicketsSection } from "@/components/profile/profile-tickets-section";
import {
  ProfileDepartmentCard,
  ProfileNotificationsSummary,
  ProfileTestimonialCta,
  ProfileChartesCard,
  ProfileQuizCard,
  ProfileKeyboardCard,
} from "@/components/profile/profile-misc-cards";
import type {
  ApiError,
  ProfileData,
  CharteStatus,
  GedSummaryData,
  QuizHistoryData,
  RecentActivityItem,
} from "@/components/profile/types";

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const { t } = useTranslation();
  const unreadNotifCount = useNotificationStore((s) => s.unreadCount);

  // -------- Editable profile fields (sync with user) --------
  const [editPhone, setEditPhone] = useState(user?.phone || "");
  const [editLocation, setEditLocation] = useState(user?.location || "");
  const [editSkills, setEditSkills] = useState(user?.skills || "");
  const [editLanguages, setEditLanguages] = useState(user?.languages || "");
  const [editTeamsLink, setEditTeamsLink] = useState(user?.teamsLink || "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  useEffect(() => {
    if (user) {
      setEditPhone(user.phone || "");
      setEditLocation(user.location || "");
      setEditSkills(() => {
        try {
          return user.skills ? JSON.parse(user.skills).join(", ") : "";
        } catch {
          return user.skills || "";
        }
      });
      setEditLanguages(() => {
        try {
          return user.languages ? JSON.parse(user.languages).join(", ") : "";
        } catch {
          return user.languages || "";
        }
      });
      setEditTeamsLink(user.teamsLink || "");
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const payload = {
        phone: editPhone,
        location: editLocation,
        skills: JSON.stringify(
          editSkills
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        ),
        languages: JSON.stringify(
          editLanguages
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        ),
        teamsLink: editTeamsLink,
      };
      const { data } = await api.patch("/users/me", payload);
      if (user) {
        setUser({
          ...user,
          phone: data.phone,
          location: data.location,
          skills: data.skills,
          languages: data.languages,
          teamsLink: data.teamsLink,
          manager: data.manager,
          subordinates: data.subordinates,
        });
      }
      toast.success(t("profile.updated"));
    } catch (err) {
      toast.error(
        (err as ApiError)?.response?.data?.message ||
          (err as ApiError)?.message ||
          t("profile.updateError"),
      );
    } finally {
      setSavingProfile(false);
    }
  };

  // -------- Loaded remote state --------
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivityItem[]>(
    [],
  );
  const [myDocs, setMyDocs] = useState(0);
  const [myOpenTickets, setMyOpenTickets] = useState(0);
  const [chartes, setChartes] = useState<CharteStatus[]>([]);
  const [quizHistory, setQuizHistory] = useState<QuizHistoryData | null>(null);
  const [gedSummary, setGedSummary] = useState<GedSummaryData | null>(null);

  useEffect(() => {
    api
      .get("/documents/ged/my-summary")
      .then(({ data }) => {
        if (data) setGedSummary(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    api
      .get("/mfa/status")
      .then(({ data }) => {
        setProfile({
          mfaEnabled: data.mfaEnabled ?? false,
          lastLoginAt: data.lastLoginAt ?? null,
          chartesAcceptedAt: data.chartesAcceptedAt ?? null,
        });
      })
      .catch(() => {});
    api
      .get("/audit/my-activity", { params: { limit: 5 } })
      .then((r) => setRecentActivity(r.data?.data || []))
      .catch(() => {});
    api
      .get("/documents", { params: { limit: 1 } })
      .then((r) => setMyDocs(r.data?.meta?.total || 0))
      .catch(() => {});
    api
      .get("/tickets", { params: { limit: 1, status: "OPEN" } })
      .then((r) => setMyOpenTickets(r.data?.meta?.total || 0))
      .catch(() => {});
    api
      .get("/quiz/leaderboard")
      .then(({ data }) => {
        const entries = Array.isArray(data) ? data : data?.data || [];
        if (entries.length > 0) {
          const myEntry = entries.find(
            (e: {
              user?: { id: string };
              score: number;
              total: number;
              date: string;
            }) => e.user?.id === user?.id,
          );
          const myRank = myEntry ? entries.indexOf(myEntry) + 1 : 0;
          if (myEntry) {
            setQuizHistory({
              bestScore: myEntry.score,
              bestTotal: myEntry.total,
              lastDate: myEntry.date,
              rank: myRank,
              totalParticipants: entries.length,
            });
          }
        }
      })
      .catch(() => {});
    api
      .get("/chartes")
      .then(({ data }) => {
        const items = data?.data || data || [];
        setChartes(
          items.map(
            (c: {
              id: string;
              title?: string;
              name?: string;
              signedAt?: string;
              acceptedAt?: string;
            }) => ({
              id: c.id,
              title: c.title || c.name || "Charte",
              signedAt: c.signedAt || c.acceptedAt || null,
            }),
          ),
        );
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------- Derived --------
  const parsedSkills = (() => {
    if (!user?.skills) return [];
    try {
      const arr = JSON.parse(user.skills);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return user.skills
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
    }
  })();

  const parsedLanguages = (() => {
    if (!user?.languages) return [];
    try {
      const arr = JSON.parse(user.languages);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return user.languages
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
    }
  })();

  if (!user) return null;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in-up">
      <ProfileHeader
        user={user}
        profile={profile}
        myDocs={myDocs}
        unreadNotifCount={unreadNotifCount}
        parsedSkills={parsedSkills}
        parsedLanguages={parsedLanguages}
        onOpenEditModal={() => setShowEditModal(true)}
      />

      <ProfileEditModal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        editPhone={editPhone}
        setEditPhone={setEditPhone}
        editLocation={editLocation}
        setEditLocation={setEditLocation}
        editSkills={editSkills}
        setEditSkills={setEditSkills}
        editLanguages={editLanguages}
        setEditLanguages={setEditLanguages}
        editTeamsLink={editTeamsLink}
        setEditTeamsLink={setEditTeamsLink}
        savingProfile={savingProfile}
        onSave={handleSaveProfile}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* === LEFT COLUMN === */}
        <div className="space-y-6 [&>*]:stagger-item">
          <ProfileManagerTeam user={user} />
          <ProfilePersonalInfo
            editPhone={editPhone}
            setEditPhone={setEditPhone}
            editLocation={editLocation}
            setEditLocation={setEditLocation}
            editSkills={editSkills}
            setEditSkills={setEditSkills}
            editLanguages={editLanguages}
            setEditLanguages={setEditLanguages}
            editTeamsLink={editTeamsLink}
            setEditTeamsLink={setEditTeamsLink}
            savingProfile={savingProfile}
            onSave={handleSaveProfile}
          />
          <ProfileDepartmentCard departmentName={user.departmentName} />
          <ProfileNotificationsSummary unreadCount={unreadNotifCount} />
          <ProfileTestimonialCta />
          <ProfileChartesCard chartes={chartes} />
          <ProfileSecuritySection profile={profile} />
          <ProfileChangePassword />
        </div>

        {/* === RIGHT COLUMN === */}
        <div className="space-y-6 [&>*]:stagger-item">
          <ProfileQuizCard quizHistory={quizHistory} />
          <ProfileActivitySection
            myDocs={myDocs}
            myOpenTickets={myOpenTickets}
            recentActivity={recentActivity}
          />
          <ProfileTicketsSection myOpenTickets={myOpenTickets} />
          <ProfileKeyboardCard />
          <ProfileDocumentsSection userId={user.id} gedSummary={gedSummary} />
          <ProfilePreferencesSection />
          <ProfileRgpdSection />
        </div>
      </div>
    </div>
  );
}
