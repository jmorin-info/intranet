'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useNotificationStore } from '@/stores/notification-store';
import { USER_ROLE_LABELS } from '@omnitech/shared';
import {
  Card,
  CardContent,
  CardHeader,
  CardFooter,
  Button,
  Input,
  Avatar,
  Badge,
} from '@omnitech/ui';
import { getInitials, formatDate, formatRelativeTime } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';
import { getAvatarUrl } from '@/lib/avatar';
import {
  User,
  Lock,
  Download,
  Shield,
  Save,
  Clock,
  FileText,
  CheckCircle2,
  Monitor,
  Activity,
  Keyboard,
  FolderOpen,
  Bell,
  Building2,
  PenLine,
  Trophy,
  Camera,
  Phone,
  MapPin,
  Tags,
  Globe,
  Link2,
  Users,
  MessageSquare,
  X,
  ChevronDown,
} from 'lucide-react';

interface ApiError {
  message?: string;
  response?: { data?: { message?: string } };
}

interface ProfileData {
  mfaEnabled: boolean;
  lastLoginAt?: string;
  chartesAcceptedAt?: string;
}

interface DepartmentInfo {
  id: string;
  name: string;
  code: string;
}

interface CharteStatus {
  id: string;
  title: string;
  signedAt: string | null;
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Mot de passe actuel requis'),
    newPassword: z.string().min(12, 'Minimum 12 caractères'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  });

type PasswordForm = z.infer<typeof passwordSchema>;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

function EditInPlaceField({ icon: Icon, label, value, onChange, placeholder }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg group transition-colors duration-200 hover:bg-gray-100 dark:hover:bg-slate-700/60">
      <Icon className="h-4 w-4 text-taupe dark:text-slate-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-medium text-taupe dark:text-slate-500 uppercase tracking-widest">{label}</p>
        {editing ? (
          <input
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => e.key === 'Enter' && setEditing(false)}
            placeholder={placeholder}
            aria-label={label}
            className="w-full text-sm text-navy dark:text-white bg-transparent border-b border-primary outline-none py-0.5 placeholder:text-taupe/40 focus:ring-2 focus:ring-primary/15"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm text-navy dark:text-white text-left w-full truncate flex items-center gap-1.5 cursor-text"
          >
            {value || <span className="text-taupe dark:text-slate-500 italic">{placeholder}</span>}
            <PenLine className="h-3 w-3 text-taupe/40 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const user = useAuthStore(s => s.user);
  const setUser = useAuthStore(s => s.setUser);
  const { locale, setLocale } = useUIStore();
  const { t } = useTranslation();
  const [changingPassword, setChangingPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error(t('profile.photoFormats'));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t('profile.photoMaxSize'));
      return;
    }

    // Show local preview immediately before upload completes
    const previewUrl = URL.createObjectURL(file);
    setAvatarPreview(previewUrl);

    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const { data } = await api.post('/users/me/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (user) {
        setUser({ ...user, avatarUrl: data.avatarUrl });
      }
      toast.success(t('profile.photoUpdated'));
      // Clear the local preview once the server copy is in use (avoids leaking the object URL)
      URL.revokeObjectURL(previewUrl);
      setAvatarPreview(null);
    } catch (err) {
      toast.error((err as ApiError)?.response?.data?.message || (err as ApiError)?.message || t('profile.photoError'));
      // Revert preview on error
      URL.revokeObjectURL(previewUrl);
      setAvatarPreview(null);
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const [savingProfile, setSavingProfile] = useState(false);
  const [editPhone, setEditPhone] = useState(user?.phone || '');
  const [editLocation, setEditLocation] = useState(user?.location || '');
  const [editSkills, setEditSkills] = useState(user?.skills || '');
  const [editLanguages, setEditLanguages] = useState(user?.languages || '');
  const [editTeamsLink, setEditTeamsLink] = useState(user?.teamsLink || '');

  // Sync edit fields when user data loads
  useEffect(() => {
    if (user) {
      setEditPhone(user.phone || '');
      setEditLocation(user.location || '');
      setEditSkills(() => {
        try { return user.skills ? JSON.parse(user.skills).join(', ') : ''; } catch { return user.skills || ''; }
      });
      setEditLanguages(() => {
        try { return user.languages ? JSON.parse(user.languages).join(', ') : ''; } catch { return user.languages || ''; }
      });
      setEditTeamsLink(user.teamsLink || '');
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const payload = {
        phone: editPhone,
        location: editLocation,
        skills: JSON.stringify(editSkills.split(',').map(s => s.trim()).filter(Boolean)),
        languages: JSON.stringify(editLanguages.split(',').map(s => s.trim()).filter(Boolean)),
        teamsLink: editTeamsLink,
      };
      const { data } = await api.patch('/users/me', payload);
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
      toast.success(t('profile.updated'));
    } catch (err) {
      toast.error((err as ApiError)?.response?.data?.message || (err as ApiError)?.message || t('profile.updateError'));
    } finally {
      setSavingProfile(false);
    }
  };

  const [requestingExport, setRequestingExport] = useState(false);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [recentActivity, setRecentActivity] = useState<Array<{ id: string; action: string; createdAt: string; date?: string; details?: string | Record<string, unknown> }>>([]);
  const [myDocs, setMyDocs] = useState(0);
  const [myOpenTickets, setMyOpenTickets] = useState(0);
  const [departments, setDepartments] = useState<DepartmentInfo[]>([]);
  const unreadNotifCount = useNotificationStore((s) => s.unreadCount);
  const [chartes, setChartes] = useState<CharteStatus[]>([]);
  const [quizHistory, setQuizHistory] = useState<{ bestScore: number; bestTotal: number; lastDate: string; rank: number; totalParticipants: number } | null>(null);
  const [notifPrefs, setNotifPrefs] = useState<{
    emailDocuments: boolean;
    emailTickets: boolean;
    emailSecurityAlerts: boolean;
    emailNews: boolean;
    dailySummary: boolean;
    pushBrowser: boolean;
  }>({ emailDocuments: true, emailTickets: true, emailSecurityAlerts: true, emailNews: true, dailySummary: false, pushBrowser: false });
  const [savingNotifPrefs, setSavingNotifPrefs] = useState(false);
  const [gedSummary, setGedSummary] = useState<{
    myDrafts: number;
    myInReview: number;
    toApproveByMe: number;
    toConfirmByMe: number;
    nearReviewDate: number;
    total: number;
  } | null>(null);

  // Load notification preferences from dedicated endpoint on mount
  useEffect(() => {
    api.get('/users/me/notification-preferences').then(({ data }) => {
      if (data) {
        setNotifPrefs({
          emailDocuments: data.emailDocuments ?? true,
          emailTickets: data.emailTickets ?? true,
          emailSecurityAlerts: true, // always forced
          emailNews: data.emailNews ?? true,
          dailySummary: data.dailySummary ?? false,
          pushBrowser: data.pushBrowser ?? false,
        });
      }
    }).catch(() => {});
    api.get('/documents/ged/my-summary').then(({ data }) => {
      if (data) setGedSummary(data);
    }).catch(() => {});
  }, []);

  const toggleNotifPref = async (key: keyof typeof notifPrefs) => {
    if (key === 'emailSecurityAlerts') return; // cannot toggle
    const previous = notifPrefs;
    const updated = { ...notifPrefs, [key]: !notifPrefs[key] };
    setNotifPrefs(updated);
    setSavingNotifPrefs(true);
    try {
      await api.patch('/users/me/notification-preferences', {
        emailDocuments: updated.emailDocuments,
        emailTickets: updated.emailTickets,
        emailNews: updated.emailNews,
        dailySummary: updated.dailySummary,
        pushBrowser: updated.pushBrowser,
      });
      toast.success(t('profile.preferenceUpdated'));
    } catch (err) {
      // Revert to the previous snapshot (avoid stale closure over notifPrefs)
      setNotifPrefs(previous);
      toast.error((err as ApiError)?.response?.data?.message || (err as ApiError)?.message || t('profile.preferenceError'));
    } finally {
      setSavingNotifPrefs(false);
    }
  };

  useEffect(() => {
    api.get('/mfa/status').then(({ data }) => {
      setProfile({
        mfaEnabled: data.mfaEnabled ?? false,
        lastLoginAt: data.lastLoginAt ?? null,
        chartesAcceptedAt: data.chartesAcceptedAt ?? null,
      });
    }).catch(() => {});
    api.get('/audit/my-activity', { params: { limit: 5 } }).then(r => setRecentActivity(r.data?.data || [])).catch(() => {});
    api.get('/documents', { params: { limit: 1 } }).then(r => setMyDocs(r.data?.meta?.total || 0)).catch(() => {});
    api.get('/tickets', { params: { limit: 1, status: 'OPEN' } }).then(r => setMyOpenTickets(r.data?.meta?.total || 0)).catch(() => {});
    api.get('/departments').then(({ data }) => {
      const allDepts: DepartmentInfo[] = data?.data || data || [];
      setDepartments(allDepts);
    }).catch(() => {});
    // unreadNotifCount now reads from useNotificationStore (polled every 60s by auth-provider)
    api.get('/quiz/leaderboard').then(({ data }) => {
      const entries = Array.isArray(data) ? data : (data?.data || []);
      if (entries.length > 0) {
        const myEntry = entries.find((e: { user?: { id: string }; score: number; total: number; date: string }) => e.user?.id === user?.id);
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
    }).catch(() => {});
    api.get('/chartes').then(({ data }) => {
      const items = data?.data || data || [];
      setChartes(items.map((c: { id: string; title?: string; name?: string; signedAt?: string; acceptedAt?: string }) => ({
        id: c.id,
        title: c.title || c.name || 'Charte',
        signedAt: c.signedAt || c.acceptedAt || null,
      })));
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
  });

  const watchedNewPassword = watch('newPassword') || '';

  const onChangePassword = async (data: PasswordForm) => {
    setChangingPassword(true);
    try {
      await api.post('/users/me/change-password', {
        oldPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      toast.success(t('profile.passwordChanged'));
      reset();
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur';
      toast.error(msg);
    } finally {
      setChangingPassword(false);
    }
  };

  const handleDataExport = async () => {
    setRequestingExport(true);
    try {
      const response = await api.post('/users/me/gdpr-export', null, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const date = new Date().toISOString().split('T')[0];
      link.setAttribute('download', `export-rgpd-${date}.json`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(t('profile.rgpdExported'));
    } catch (err) {
      toast.error((err as ApiError)?.response?.data?.message || (err as ApiError)?.message || t('profile.rgpdError'));
    } finally {
      setRequestingExport(false);
    }
  };

  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordSection, setShowPasswordSection] = useState(false);

  const skillColors = [
    'bg-primary/10 text-primary border-primary/20',
    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800',
    'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800',
    'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800',
    'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800',
    'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/20 dark:text-cyan-400 dark:border-cyan-800',
    'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-800',
    'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/20 dark:text-teal-400 dark:border-teal-800',
  ];

  const parsedSkills = (() => {
    if (!user?.skills) return [];
    try { const arr = JSON.parse(user.skills); return Array.isArray(arr) ? arr : []; }
    catch { return user.skills.split(',').map((s: string) => s.trim()).filter(Boolean); }
  })();

  const parsedLanguages = (() => {
    if (!user?.languages) return [];
    try { const arr = JSON.parse(user.languages); return Array.isArray(arr) ? arr : []; }
    catch { return user.languages.split(',').map((s: string) => s.trim()).filter(Boolean); }
  })();

  if (!user) return null;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in-up">
      {/* Hero section — full width */}
      <Card className="overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-navy via-navy/80 to-primary/60 relative">
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
              title={t('profile.changePhoto')}
              aria-label={t('profile.changePhoto')}
            >
              {(avatarPreview || user.avatarUrl) ? (
                <Avatar
                  src={avatarPreview || getAvatarUrl(user.avatarUrl!)}
                  initials={getInitials(user.firstName, user.lastName)}
                  size="lg"
                  className="h-28 w-28 text-3xl ring-4 ring-white dark:ring-slate-900 shadow-lg"
                />
              ) : (
                <div className="flex h-28 w-28 items-center justify-center rounded-full bg-primary text-white text-3xl font-semibold shadow-lg ring-4 ring-white dark:ring-slate-900">
                  {user.firstName.charAt(0)}{user.lastName.charAt(0)}
                </div>
              )}
              <div className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                {uploadingAvatar ? (
                  <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Camera className="h-5 w-5 text-white" />
                    <span className="text-[9px] text-white font-medium mt-0.5">Changer la photo</span>
                  </>
                )}
              </div>
            </button>
            <div className="flex-1 min-w-0 pb-1">
              {/* CTA to change avatar when using default initials */}
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
              <h1 className="text-2xl font-medium text-navy dark:text-white">
                {user.firstName} {user.lastName}
              </h1>
              {user.jobTitle && (
                <p className="text-sm text-taupe dark:text-slate-400">{user.jobTitle}</p>
              )}
              <p className="text-sm text-taupe dark:text-slate-400">{user.email}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold text-white bg-gradient-to-r from-primary to-primary/80 shadow-sm">
                  <Shield className="h-3.5 w-3.5" />
                  {USER_ROLE_LABELS[user.role]}
                </span>
                {user.departmentName && (
                  <Badge variant="navy">{user.departmentName}</Badge>
                )}
                {user.location && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-taupe dark:text-slate-400">
                    <MapPin className="h-3 w-3" /> {user.location}
                  </span>
                )}
                {profile?.lastLoginAt && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-taupe dark:text-slate-400">
                    <Clock className="h-3 w-3" /> Dernière connexion : {formatRelativeTime(profile.lastLoginAt)}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 pb-1 flex-shrink-0">
              {(user.teamsLink || user.email) && (
                <a
                  href={user.teamsLink || `ms-teams://l/chat/0/0?users=${encodeURIComponent(user.email)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#6264A7] hover:bg-[#525498] rounded-lg transition-colors"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Teams
                </a>
              )}
              <Button variant="outline" size="sm" onClick={() => setShowEditModal(true)}>
                <PenLine className="h-3.5 w-3.5" /> Modifier
              </Button>
            </div>
          </div>

          {/* Skills & Languages chips */}
          {(parsedSkills.length > 0 || parsedLanguages.length > 0) && (
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700">
              {parsedSkills.length > 0 && (
                <div className="mb-2">
                  <p className="text-[10px] font-medium text-taupe dark:text-slate-500 uppercase tracking-widest mb-2">Compétences</p>
                  <div className="flex flex-wrap gap-1.5">
                    {parsedSkills.map((skill: string, i: number) => (
                      <span key={skill} className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${skillColors[i % skillColors.length]}`}>
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {parsedLanguages.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium text-taupe dark:text-slate-500 uppercase tracking-widest mb-2">Langues</p>
                  <div className="flex flex-wrap gap-1.5">
                    {parsedLanguages.map((lang: string) => (
                      <span key={lang} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-slate-800 text-navy dark:text-white border border-gray-200 dark:border-slate-700">
                        <Globe className="h-3 w-3 text-taupe" /> {lang}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-100 dark:border-slate-700">
            <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-slate-800">
              <p className="text-3xl font-bold text-navy dark:text-white">{myDocs}</p>
              <p className="text-[10px] text-taupe dark:text-slate-400 mb-1.5">Documents</p>
              <div className="h-1 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
                <div className="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${Math.min(100, myDocs * 2)}%` }} />
              </div>
            </div>
            <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-slate-800">
              <p className="text-3xl font-bold text-navy dark:text-white">{unreadNotifCount}</p>
              <p className="text-[10px] text-taupe dark:text-slate-400 mb-1.5">Notifications</p>
              <div className="h-1 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
                <div className="h-full rounded-full bg-amber-500 transition-all duration-500" style={{ width: `${Math.min(100, unreadNotifCount * 10)}%` }} />
              </div>
            </div>
            <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-slate-800">
              <p className="text-lg font-bold text-navy dark:text-white">{user.createdAt ? formatDate(user.createdAt) : '—'}</p>
              <p className="text-[10px] text-taupe dark:text-slate-400">Membre depuis</p>
            </div>
            <div className={`text-center p-3 rounded-lg ${profile?.mfaEnabled ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-amber-50 dark:bg-amber-900/20'}`}>
              <p className={`text-3xl font-bold ${profile?.mfaEnabled ? 'text-emerald-600' : 'text-amber-600'}`}>{profile?.mfaEnabled ? '\u2713' : '!'}</p>
              <p className="text-[10px] text-taupe dark:text-slate-400">MFA {profile?.mfaEnabled ? 'Actif' : 'Inactif'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit profile modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in-scale" onClick={() => setShowEditModal(false)} onKeyDown={(e) => { if (e.key === 'Escape') setShowEditModal(false); }}>
          <div ref={(el) => { if (el) { requestAnimationFrame(() => { const input = el.querySelector<HTMLElement>('input:not([type="hidden"]):not([disabled])'); input?.focus(); }); } }} className="bg-white dark:bg-slate-900 rounded-xl p-6 max-w-md w-full mx-4 shadow-xl max-h-[85vh] overflow-y-auto animate-fade-in-scale" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-navy dark:text-white flex items-center gap-2">
                <PenLine className="h-5 w-5 text-primary" />
                Modifier mon profil
              </h3>
              <button onClick={() => setShowEditModal(false)} title="Fermer" className="p-1.5 rounded-lg text-taupe hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-taupe dark:text-slate-400 flex items-center gap-1.5 mb-1">
                  <Phone className="h-3.5 w-3.5" /> Téléphone
                </label>
                <Input
                  value={editPhone}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditPhone(e.target.value)}
                  placeholder="+33 1 23 45 67 89"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-taupe dark:text-slate-400 flex items-center gap-1.5 mb-1">
                  <MapPin className="h-3.5 w-3.5" /> Localisation / Bureau
                </label>
                <Input
                  value={editLocation}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditLocation(e.target.value)}
                  placeholder="Bureau 301, Paris"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-taupe dark:text-slate-400 flex items-center gap-1.5 mb-1">
                  <Tags className="h-3.5 w-3.5" /> Compétences (séparées par des virgules)
                </label>
                <Input
                  value={editSkills}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditSkills(e.target.value)}
                  placeholder="Cybersécurité, ISO 27001, Audit"
                />
                {editSkills && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {editSkills.split(',').map((s: string) => s.trim()).filter(Boolean).map((skill: string, i: number) => (
                      <span key={skill} className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${skillColors[i % skillColors.length]}`}>{skill}</span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-taupe dark:text-slate-400 flex items-center gap-1.5 mb-1">
                  <Globe className="h-3.5 w-3.5" /> Langues (séparées par des virgules)
                </label>
                <Input
                  value={editLanguages}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditLanguages(e.target.value)}
                  placeholder="Français, Anglais, Espagnol"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-taupe dark:text-slate-400 flex items-center gap-1.5 mb-1">
                  <Link2 className="h-3.5 w-3.5" /> Lien Teams
                </label>
                <Input
                  value={editTeamsLink}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditTeamsLink(e.target.value)}
                  placeholder="https://teams.microsoft.com/l/chat/..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100 dark:border-slate-700">
              <Button variant="outline" onClick={() => setShowEditModal(false)}>Annuler</Button>
              <Button onClick={() => { handleSaveProfile(); setShowEditModal(false); }} loading={savingProfile} disabled={savingProfile}>
                <Save className="h-4 w-4" />
                {savingProfile ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Two-column layout: left (personal info, MFA, security) / right (notif prefs, docs, activity) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* === LEFT COLUMN === */}
      <div className="space-y-6 [&>*]:stagger-item">

      {/* Manager & Subordinates */}
      {(user.manager || (user.subordinates && user.subordinates.length > 0)) && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-medium text-navy dark:text-white flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Organisation
            </h2>
          </CardHeader>
          <CardContent className="space-y-3">
            {user.manager && (
              <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
                  {user.manager.firstName.charAt(0)}{user.manager.lastName.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-navy dark:text-white">
                    Manager : {user.manager.firstName} {user.manager.lastName}
                  </p>
                  <p className="text-xs text-taupe dark:text-slate-400">{user.manager.email}</p>
                </div>
              </div>
            )}
            {user.subordinates && user.subordinates.length > 0 && (
              <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
                <Users className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-semibold text-navy dark:text-white">
                    Équipe : {user.subordinates.length} collaborateur{user.subordinates.length > 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-taupe dark:text-slate-400">
                    {user.subordinates.map(s => `${s.firstName} ${s.lastName}`).join(', ')}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Informations personnelles — edit-in-place */}
      <Card className="shadow-sm rounded-xl">
        <CardHeader>
          <h2 className="text-lg font-medium text-navy dark:text-white flex items-center gap-2">
            <PenLine className="h-5 w-5 text-primary" />
            Informations personnelles
          </h2>
        </CardHeader>
        <CardContent className="space-y-3">
          {([
            { icon: Phone, label: 'T\u00e9l\u00e9phone', value: editPhone, setter: setEditPhone, placeholder: '+33 1 23 45 67 89' },
            { icon: MapPin, label: 'Localisation', value: editLocation, setter: setEditLocation, placeholder: 'Bureau 301, Paris' },
            { icon: Tags, label: 'Comp\u00e9tences', value: editSkills, setter: setEditSkills, placeholder: 'Cybers\u00e9curit\u00e9, ISO 27001, Audit' },
            { icon: Globe, label: 'Langues', value: editLanguages, setter: setEditLanguages, placeholder: 'Fran\u00e7ais, Anglais' },
            { icon: Link2, label: 'Lien Teams', value: editTeamsLink, setter: setEditTeamsLink, placeholder: 'https://teams.microsoft.com/...' },
          ] as const).map(({ icon: Icon, label, value, setter, placeholder }) => (
            <EditInPlaceField
              key={label}
              icon={Icon}
              label={label}
              value={value}
              onChange={setter}
              placeholder={placeholder}
            />
          ))}
          <div className="flex justify-end pt-2">
            <Button size="sm" onClick={handleSaveProfile} loading={savingProfile} disabled={savingProfile}>
              <Save className="h-3.5 w-3.5" /> {savingProfile ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Departments */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-medium text-navy dark:text-white flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {t('profile.departments')}
          </h2>
        </CardHeader>
        <CardContent>
          {user.departmentName ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
                <Building2 className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-semibold text-navy dark:text-white">{user.departmentName}</p>
                  <p className="text-xs text-taupe dark:text-slate-400">{t('profile.mainDepartment')}</p>
                </div>
                <Badge variant="primary" className="ml-auto">Actif</Badge>
              </div>
            </div>
          ) : (
            <p className="text-sm text-taupe dark:text-slate-400 text-center py-3">
              Aucun département assigné
            </p>
          )}
        </CardContent>
      </Card>

      {/* Notifications summary */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-semibold text-navy dark:text-white">Notifications</p>
                <p className="text-xs text-taupe dark:text-slate-400">
                  {unreadNotifCount > 0
                    ? `${unreadNotifCount} notification${unreadNotifCount > 1 ? 's' : ''} non lue${unreadNotifCount > 1 ? 's' : ''}`
                    : 'Toutes les notifications sont lues'}
                </p>
              </div>
            </div>
            <Link href="/notifications">
              <Button variant="outline" size="sm">Voir tout</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Chartes status */}
      {chartes.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-medium text-navy dark:text-white flex items-center gap-2">
              <PenLine className="h-5 w-5 text-primary" />
              Chartes obligatoires
            </h2>
          </CardHeader>
          <CardContent className="space-y-2">
            {chartes.map((charte) => (
              <div key={charte.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
                <FileText className={`h-5 w-5 ${charte.signedAt ? 'text-emerald-500' : 'text-amber-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-navy dark:text-white truncate">{charte.title}</p>
                  <p className="text-xs text-taupe dark:text-slate-400">
                    {charte.signedAt
                      ? `Signée le ${formatDate(charte.signedAt)}`
                      : 'En attente de signature'}
                  </p>
                </div>
                <Badge variant={charte.signedAt ? 'success' : 'warning'}>
                  {charte.signedAt ? 'Signée' : 'À signer'}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Security section */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-medium text-navy dark:text-white">Sécurité du compte</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* MFA Status — prominent */}
          <div className={`flex items-center justify-between p-4 rounded-xl border-2 transition-colors duration-200 ${
            profile?.mfaEnabled
              ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
              : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                profile?.mfaEnabled
                  ? 'bg-emerald-100 dark:bg-emerald-900/40'
                  : 'bg-amber-100 dark:bg-amber-900/40'
              }`}>
                <Shield className={`h-5 w-5 ${profile?.mfaEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-navy dark:text-white flex items-center gap-1.5">
                  Authentification MFA
                  {profile?.mfaEnabled ? (
                    <span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">Activé</span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400 text-xs font-medium">Désactivé</span>
                  )}
                </p>
                <p className="text-xs text-taupe dark:text-slate-400">
                  {profile?.mfaEnabled ? 'TOTP configur\u00e9 — votre compte est prot\u00e9g\u00e9' : 'Votre compte n\u2019est pas prot\u00e9g\u00e9 par un second facteur'}
                </p>
              </div>
            </div>
            <Link href="/mfa">
              <Button variant={profile?.mfaEnabled ? 'outline' : 'primary'} size="sm">
                {profile?.mfaEnabled ? 'G\u00e9rer' : 'Activer maintenant'}
              </Button>
            </Link>
          </div>

          {/* Last login */}
          {profile?.lastLoginAt && (
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
              <Clock className="h-5 w-5 text-taupe" />
              <div>
                <p className="text-sm font-semibold text-navy dark:text-white">Dernière connexion</p>
                <p className="text-xs text-taupe dark:text-slate-400">{formatDate(profile.lastLoginAt)}</p>
              </div>
            </div>
          )}

          {/* Active session info */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
            <Monitor className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-semibold text-navy dark:text-white">Session active</p>
              <p className="text-xs text-taupe dark:text-slate-400">
                {profile?.lastLoginAt
                  ? `Connect\u00e9 depuis le ${new Date(profile.lastLoginAt).toLocaleDateString('fr-FR')} \u00e0 ${new Date(profile.lastLoginAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
                  : `Connect\u00e9 le ${new Date().toLocaleDateString('fr-FR')}`}
                {' '}&mdash;{' '}
                {typeof navigator !== 'undefined' && navigator?.userAgent?.includes('Windows') ? 'Windows' : typeof navigator !== 'undefined' && navigator?.userAgent?.includes('Mac') ? 'macOS' : 'Linux'}
              </p>
            </div>
          </div>

          {/* Chartes status */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
            <FileText className="h-5 w-5 text-emerald-500" />
            <div>
              <p className="text-sm font-semibold text-navy dark:text-white">Chartes obligatoires</p>
              <p className="text-xs text-taupe dark:text-slate-400">
                {profile?.chartesAcceptedAt ? `Signées le ${formatDate(profile.chartesAcceptedAt)}` : 'En attente de signature'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Change password — collapsible */}
      <Card>
        <CardHeader>
          <button
            type="button"
            onClick={() => setShowPasswordSection(!showPasswordSection)}
            className="w-full flex items-center justify-between"
          >
            <h2 className="text-lg font-medium text-navy dark:text-white flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              Modifier le mot de passe
            </h2>
            <ChevronDown className={`h-5 w-5 text-taupe transition-transform ${showPasswordSection ? 'rotate-180' : ''}`} />
          </button>
        </CardHeader>
        {showPasswordSection && (
        <form onSubmit={handleSubmit(onChangePassword)}>
          <CardContent className="space-y-3">
            <Input
              label={t('profile.currentPassword')}
              type="password"
              error={errors.currentPassword?.message}
              {...register('currentPassword')}
            />
            <Input
              label={t('profile.newPassword')}
              type="password"
              error={errors.newPassword?.message}
              {...register('newPassword')}
            />
            {watchedNewPassword && (() => {
              const score =
                (watchedNewPassword.length >= 12 ? 1 : 0) +
                (/[A-Z]/.test(watchedNewPassword) ? 1 : 0) +
                (/[0-9]/.test(watchedNewPassword) ? 1 : 0) +
                (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(watchedNewPassword) ? 1 : 0);
              const barColors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500'];
              const labels = ['Faible', 'Faible', 'Moyen', 'Fort', 'Excellent'];
              const labelColors = ['text-red-500', 'text-red-500', 'text-orange-500', 'text-yellow-600', 'text-green-600'];
              return (
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex flex-1 gap-1">
                      {[0, 1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className={`h-1.5 flex-1 rounded-full transition-colors ${
                            i < score
                              ? barColors[score - 1]
                              : 'bg-gray-200 dark:bg-slate-700'
                          }`}
                        />
                      ))}
                    </div>
                    <span className={`text-[11px] font-semibold ${labelColors[score]}`}>
                      {labels[score]}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {[
                      { test: watchedNewPassword.length >= 12, label: '12 caractères minimum' },
                      { test: /[A-Z]/.test(watchedNewPassword), label: 'Une majuscule' },
                      { test: /[a-z]/.test(watchedNewPassword), label: 'Une minuscule' },
                      { test: /[0-9]/.test(watchedNewPassword), label: 'Un chiffre' },
                      { test: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(watchedNewPassword), label: 'Un caractère spécial' },
                    ].map(({ test, label }) => (
                      <div key={label} className={`flex items-center gap-1.5 text-xs ${test ? 'text-emerald-600' : 'text-taupe dark:text-slate-400'}`}>
                        {test ? <CheckCircle2 className="h-3 w-3" /> : <div className="h-3 w-3 rounded-full border border-gray-300 dark:border-slate-600" />}
                        {label}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
            <Input
              label={t('profile.confirmPassword')}
              type="password"
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />
          </CardContent>
          <CardFooter>
            <div className="flex justify-end">
              <Button type="submit" loading={changingPassword} disabled={changingPassword}>
                <Save className="h-4 w-4" />
                {changingPassword ? 'Modification…' : 'Modifier'}
              </Button>
            </div>
          </CardFooter>
        </form>
        )}
      </Card>

      </div>{/* end LEFT COLUMN */}

      {/* === RIGHT COLUMN === */}
      <div className="space-y-6 [&>*]:stagger-item">

      {/* Quiz history */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-medium text-navy dark:text-white flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" /> Quiz sécurité
          </h2>
        </CardHeader>
        <CardContent>
          {quizHistory ? (
            <div className="space-y-3">
              {/* Best score highlight */}
              <div className="p-4 bg-gradient-to-r from-primary/5 to-emerald-500/5 rounded-xl border border-primary/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-taupe dark:text-slate-400 uppercase tracking-wider">Meilleur score</span>
                  <span className="text-2xl font-bold text-primary">{quizHistory.bestScore}/{quizHistory.bestTotal}</span>
                </div>
                <div className="h-2.5 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-500 transition-all duration-700"
                    style={{ width: `${Math.round((quizHistory.bestScore / quizHistory.bestTotal) * 100)}%` }}
                  />
                </div>
                <p className="text-right text-xs font-bold text-primary mt-1">{Math.round((quizHistory.bestScore / quizHistory.bestTotal) * 100)}%</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="text-center p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-2xl font-bold text-primary">#{quizHistory.rank}</p>
                  <p className="text-[10px] text-taupe dark:text-slate-400">sur {quizHistory.totalParticipants} participants</p>
                </div>
                <div className="text-center p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-sm font-medium text-navy dark:text-white">{formatDate(quizHistory.lastDate)}</p>
                  <p className="text-[10px] text-taupe dark:text-slate-400">Derniere tentative</p>
                </div>
              </div>
              <div className="text-center">
                <Link href="/quiz">
                  <Button variant="outline" size="sm">Rejouer le quiz</Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <Trophy className="h-8 w-8 text-taupe/30 mx-auto mb-2" />
              <p className="text-sm text-taupe dark:text-slate-400">Aucune participation au quiz</p>
              <Link href="/quiz" className="text-xs text-primary hover:underline mt-1 inline-block">Tenter le quiz sécurité</Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity summary — stats row */}
      <Card>
        <CardHeader><h2 className="text-lg font-medium text-navy dark:text-white flex items-center gap-2"><Activity className="h-5 w-5 text-primary" /> Mon activité</h2></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-slate-800">
              <div className="h-9 w-9 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-lg font-medium text-navy dark:text-white">{myDocs}</p>
                <p className="text-[11px] text-taupe dark:text-slate-400">Documents créés</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-slate-800">
              <div className="h-9 w-9 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
                <FolderOpen className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-lg font-medium text-navy dark:text-white">{myOpenTickets}</p>
                <p className="text-[11px] text-taupe dark:text-slate-400">Tickets ouverts</p>
              </div>
            </div>
          </div>
          <p className="text-[10px] font-medium text-taupe dark:text-slate-500 uppercase tracking-widest mb-2">Actions récentes</p>
          {recentActivity.length > 0 ? (
            <div className="relative">
              <div className="absolute left-[15px] top-2 bottom-2 w-px bg-gray-200 dark:bg-slate-700" />
              <div className="space-y-0">
                {recentActivity.slice(0, 5).map((a) => {
                  const actionLabel = (a.action || '').replace(/_/g, ' ');
                  const isDoc = /document|upload|file/i.test(a.action);
                  const isTicket = /ticket/i.test(a.action);
                  const isQuiz = /quiz/i.test(a.action);
                  const isLogin = /login|auth|session/i.test(a.action);
                  const iconColor = isDoc ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                    : isTicket ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                    : isQuiz ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : isLogin ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400'
                    : 'bg-primary/10 text-primary';
                  const IconComp = isDoc ? FileText : isTicket ? FolderOpen : isQuiz ? Trophy : isLogin ? Shield : Activity;
                  return (
                    <div key={a.id} className="flex items-start gap-3 py-2.5 relative rounded-lg px-2 -mx-2 cursor-default">
                      <div className={`h-[30px] w-[30px] rounded-full flex items-center justify-center flex-shrink-0 z-10 shadow-sm ${iconColor}`}>
                        <IconComp className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <p className="text-xs font-medium text-navy dark:text-white capitalize">{actionLabel}</p>
                        {a.details && (
                          <p className="text-[10px] text-taupe dark:text-slate-500 truncate">{typeof a.details === 'string' ? a.details : JSON.stringify(a.details).slice(0, 80)}</p>
                        )}
                      </div>
                      <span className="text-[10px] text-taupe dark:text-slate-500 flex-shrink-0 pt-1 whitespace-nowrap">{formatRelativeTime(a.createdAt)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-xs text-taupe dark:text-slate-400 text-center py-4">Aucune activité récente</p>
          )}
        </CardContent>
      </Card>

      {/* Keyboard shortcuts */}
      <Card>
        <CardHeader><h2 className="text-lg font-medium text-navy dark:text-white flex items-center gap-2"><Keyboard className="h-5 w-5 text-primary" /> Raccourcis clavier</h2></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[
              { keys: 'Ctrl+K', desc: 'Recherche' },
              { keys: 'Ctrl+/', desc: 'Aide' },
            ].map(({ keys, desc }) => (
              <div key={keys} className="flex items-center justify-between py-1.5 border-b border-gray-200 dark:border-slate-700 last:border-0">
                <span className="text-sm text-navy dark:text-white">{desc}</span>
                <kbd className="px-2 py-0.5 text-xs font-mono bg-gray-100 dark:bg-slate-800 text-taupe dark:text-slate-300 rounded border border-gray-200 dark:border-slate-700">{keys}</kbd>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Mes documents GED */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-medium text-navy dark:text-white flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" />
            Mes documents
          </h2>
        </CardHeader>
        <CardContent>
          {gedSummary ? (
            <div className="space-y-4">
              {/* Total with progress context */}
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-semibold text-taupe dark:text-slate-400 uppercase tracking-wider">Total documents</span>
                <span className="text-2xl font-bold text-navy dark:text-white">{gedSummary.total}</span>
              </div>
              <div className="space-y-3">
                {([
                  { label: 'Brouillons', value: gedSummary.myDrafts, color: 'bg-gray-400' },
                  { label: 'En revue', value: gedSummary.myInReview, color: 'bg-amber-500' },
                  { label: 'A approuver', value: gedSummary.toApproveByMe, color: 'bg-primary' },
                  { label: 'A confirmer', value: gedSummary.toConfirmByMe, color: 'bg-emerald-500' },
                  { label: 'Revue proche', value: gedSummary.nearReviewDate, color: 'bg-red-400' },
                ] as const).map(({ label, value, color }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-xs text-taupe dark:text-slate-400 w-24 text-right flex-shrink-0">{label}</span>
                    <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
                      <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: gedSummary.total > 0 ? `${Math.max(4, (value / gedSummary.total) * 100)}%` : '0%' }} />
                    </div>
                    <span className="text-sm font-bold text-navy dark:text-white w-8 text-right tabular-nums">{value}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-center gap-3">
                <Link href={`/documents?view=ged&owner=${user.id}`}>
                  <Button variant="primary" size="sm">
                    <FileText className="h-3.5 w-3.5" /> Mes documents
                  </Button>
                </Link>
                <Link href="/documents?view=ged">
                  <Button variant="outline" size="sm">
                    <FolderOpen className="h-3.5 w-3.5" /> Ouvrir la GED
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <FolderOpen className="h-8 w-8 text-taupe/30 mx-auto mb-2" />
              <p className="text-sm text-taupe dark:text-slate-400">Chargement...</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notification preferences */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-medium text-navy dark:text-white flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Preferences de notification
          </h2>
        </CardHeader>
        <CardContent className="space-y-3">
          {([
            { key: 'emailDocuments' as const, label: 'Email pour documents', desc: 'Revue, approbation et publication de documents', forced: false },
            { key: 'emailTickets' as const, label: 'Email pour tickets assignés', desc: 'Création, mise à jour et assignation de tickets', forced: false },
            { key: 'emailSecurityAlerts' as const, label: 'Email pour alertes sécurité', desc: 'Alertes de sécurité critiques (toujours actif)', forced: true },
            { key: 'emailNews' as const, label: 'Email pour actualités', desc: 'Nouvelles de l\'entreprise et communications internes', forced: false },
            { key: 'dailySummary' as const, label: 'Résumé quotidien', desc: 'Recevoir un email résumé chaque matin', forced: false },
            { key: 'pushBrowser' as const, label: 'Push navigateur', desc: 'Notifications push dans le navigateur', forced: false },
          ]).map(pref => (
            <div key={pref.key} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
              <div>
                <p className="text-sm font-semibold text-navy dark:text-white">{pref.label}</p>
                <p className="text-xs text-taupe dark:text-slate-400">{pref.desc}</p>
              </div>
              <button
                onClick={() => toggleNotifPref(pref.key)}
                disabled={savingNotifPrefs || pref.forced}
                aria-label={`Activer/désactiver : ${pref.label}`}
                aria-checked={notifPrefs[pref.key]}
                role="switch"
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60 ${notifPrefs[pref.key] ? 'bg-primary' : 'bg-gray-300 dark:bg-slate-600'} ${pref.forced ? 'cursor-not-allowed' : ''}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${notifPrefs[pref.key] ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Language preference */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-medium text-navy dark:text-white flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Langue de l&apos;interface
          </h2>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-taupe dark:text-slate-400 mb-3">
            Choisissez la langue d&apos;affichage de l&apos;application.
          </p>
          <div className="flex gap-3">
            {([
              { value: 'fr', label: 'Français', flag: '🇫🇷' },
              { value: 'en', label: 'English', flag: '🇬🇧' },
            ] as const).map(({ value, label, flag }) => (
              <button
                key={value}
                onClick={() => {
                  setLocale(value);
                  toast.success(`Langue changée : ${label}`);
                }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${locale === value ? 'border-primary bg-primary/10 text-primary dark:text-primary' : 'border-gray-200 dark:border-slate-700 text-navy dark:text-white hover:border-primary/40 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
              >
                <span className="text-base">{flag}</span>
                {label}
                {locale === value && (
                  <CheckCircle2 className="h-4 w-4 text-primary ml-1" />
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* GDPR */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-medium text-navy dark:text-white flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Données personnelles (RGPD)
          </h2>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-taupe mb-4">
            Conformément au RGPD, vous pouvez télécharger l&apos;ensemble de vos données
            personnelles au format JSON (profil, documents, tickets, notifications, journaux).
          </p>
          <Button variant="secondary" onClick={handleDataExport} loading={requestingExport}>
            <Download className="h-4 w-4" />
            Exporter mes données
          </Button>
        </CardContent>
      </Card>

      </div>{/* end RIGHT COLUMN */}
      </div>{/* end grid */}
    </div>
  );
}
