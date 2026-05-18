"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth-store";
import { OmnitechLogo } from "@/components/omnitech-logo";
import { Button } from "@omnitech/ui";
import { LogIn } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

export default function LogoutPage() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const { t } = useTranslation();
  const [loggedOut, setLoggedOut] = useState(false);
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    logout().then(() => {
      setLoggedOut(true);
    });
  }, [logout]);

  useEffect(() => {
    if (!loggedOut) return;
    if (countdown <= 0) {
      router.push("/login");
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [loggedOut, countdown, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#F68D2E] via-[#e67d1e] to-[#d97420] p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-white/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-white/5 blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-col items-center text-center">
        <OmnitechLogo
          size="lg"
          variant="icon"
          className="mx-auto mb-6 text-white"
        />

        {!loggedOut ? (
          <>
            <div className="h-8 w-8 border-3 border-white/30 border-t-white rounded-full animate-spin mb-4" />
            <p className="text-sm text-white/70">{t("logout.title")}</p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-semibold text-white mb-2">
              {t("logout.goodbye")}
            </h1>
            <p className="text-sm text-white/60 mb-8 max-w-sm">
              {t("logout.message")}
            </p>
            <Link href="/login">
              <Button className="bg-white text-seal-navy hover:bg-white/90 font-semibold px-6">
                <LogIn className="h-4 w-4" /> {t("logout.reconnect")}
              </Button>
            </Link>
            <p className="text-xs text-white/40 mt-4">
              {t("logout.redirect").replace("{countdown}", String(countdown))}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
