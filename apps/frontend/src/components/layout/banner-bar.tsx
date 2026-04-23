"use client";

import React, { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { AlertTriangle, Info, XOctagon, X } from "lucide-react";

interface Banner {
  id: string;
  title: string;
  message: string;
  level: string; // P1, P2, P3
  isActive: boolean;
  createdAt: string;
  expiresAt: string | null;
  linkUrl?: string | null;
}

const DISMISSED_KEY = "omnitech_dismissed_banners";

function getDismissedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function addDismissedId(id: string) {
  const ids = getDismissedIds();
  ids.add(id);
  sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
}

const levelConfig: Record<
  string,
  {
    bg: string;
    text: string;
    icon: React.ElementType;
    pulse: boolean;
  }
> = {
  P1: {
    bg: "bg-red-600",
    text: "text-white",
    icon: XOctagon,
    pulse: true,
  },
  P2: {
    bg: "bg-amber-400",
    text: "text-amber-950",
    icon: AlertTriangle,
    pulse: false,
  },
  P3: {
    bg: "bg-blue-600",
    text: "text-white",
    icon: Info,
    pulse: false,
  },
};

export function BannerBar() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const fetchBanners = useCallback(async () => {
    try {
      const { data } = await api.get("/banners");
      const list: Banner[] = Array.isArray(data) ? data : data?.data || [];
      // Filter out expired banners client-side as well
      const now = new Date();
      const active = list.filter(
        (b) => b.isActive && (!b.expiresAt || new Date(b.expiresAt) > now),
      );
      setBanners(active);
    } catch {
      // Silently fail — banners are non-critical
    }
  }, []);

  useEffect(() => {
    setDismissed(getDismissedIds());
    fetchBanners();
    // Refresh every 60 seconds
    const interval = setInterval(fetchBanners, 60000);
    return () => clearInterval(interval);
  }, [fetchBanners]);

  const handleDismiss = (id: string) => {
    addDismissedId(id);
    setDismissed((prev) => new Set([...prev, id]));
  };

  const visibleBanners = banners.filter((b) => !dismissed.has(b.id));

  if (visibleBanners.length === 0) return null;

  return (
    <div className="w-full z-50">
      {visibleBanners.map((banner) => {
        const config = (levelConfig[banner.level] || levelConfig.P3)!;
        const Icon = config.icon;
        const link = banner.linkUrl?.trim();
        const isExternal = !!link && /^https?:\/\//i.test(link);
        const hasLink = !!link;

        const content = (
          <>
            <Icon
              className={`h-5 w-5 flex-shrink-0 ${config.pulse ? "animate-pulse" : ""}`}
            />
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-sm">{banner.title}</span>
              {banner.message && (
                <span className="text-sm ml-2 opacity-90">
                  {banner.message}
                </span>
              )}
              {hasLink && (
                <span className="ml-2 text-xs underline opacity-80">
                  En savoir plus →
                </span>
              )}
            </div>
          </>
        );

        return (
          <div
            key={banner.id}
            className={`${config.bg} ${config.text} px-4 py-2.5 flex items-center gap-3`}
          >
            {hasLink ? (
              <a
                href={link!}
                target={isExternal ? "_blank" : undefined}
                rel={isExternal ? "noopener noreferrer" : undefined}
                className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-90 transition-opacity"
                aria-label={`${banner.title} — ouvrir le lien`}
              >
                {content}
              </a>
            ) : (
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {content}
              </div>
            )}
            <button
              onClick={() => handleDismiss(banner.id)}
              className={`flex-shrink-0 p-1 rounded-full hover:bg-black/10 transition-colors ${config.text}`}
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
