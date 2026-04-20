'use client';

/**
 * Mode KIOSQUE — affichage plein écran pour écran mural de salle de pause.
 * Aucune authentification (route publique).
 *
 * Contenu rotatif (durée paramétrable via query `?interval=15`) :
 *   1. Actualités internes (news)
 *   2. Alertes cyber CERT-FR / veille
 *   3. Indicateurs SMSI (tickets ouverts, documents à revoir, etc.)
 *   4. Horloge + météo
 *
 * À afficher en mode F11 sur un Chromium dédié.
 */
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import axios from 'axios';
import { useTranslation } from '@/lib/i18n';

interface NewsItem {
  id: string;
  title: string;
  excerpt?: string;
  publishedAt?: string;
  coverImageUrl?: string | null;
}

interface VeilleItem {
  id: string;
  title: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  source?: string;
  publishedAt?: string;
}

interface WeatherSnap {
  temperature: number;
  description: string;
}

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

function useClock(): string {
  const [now, setNow] = useState('');
  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleString('fr-FR', {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
          hour: '2-digit',
          minute: '2-digit',
        }),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function useWeather(): WeatherSnap | null {
  const [w, setW] = useState<WeatherSnap | null>(null);
  useEffect(() => {
    fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=48.8566&longitude=2.3522&current=temperature_2m,weather_code&timezone=Europe/Paris',
    )
      .then((r) => r.json())
      .then((d) => {
        if (d.current) {
          setW({
            temperature: Math.round(d.current.temperature_2m),
            description: '',
          });
        }
      })
      .catch(() => setW(null));
    const id = setInterval(() => {
      fetch(
        'https://api.open-meteo.com/v1/forecast?latitude=48.8566&longitude=2.3522&current=temperature_2m,weather_code&timezone=Europe/Paris',
      )
        .then((r) => r.json())
        .then((d) => {
          if (d.current) {
            setW({
              temperature: Math.round(d.current.temperature_2m),
              description: '',
            });
          }
        })
        .catch(() => {});
    }, 600000); // 10min
    return () => clearInterval(id);
  }, []);
  return w;
}

export default function KioskPage() {
  const { t } = useTranslation();
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-[#004469]" />}>
      <KioskInner />
    </Suspense>
  );
}

function KioskInner() {
  const params = useSearchParams();
  const interval = Math.max(5, Number(params.get('interval')) || 15) * 1000;

  const [slide, setSlide] = useState(0);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [veille, setVeille] = useState<VeilleItem[]>([]);
  const [indicators, setIndicators] = useState<{ label: string; value: number | string; tint: string }[]>([]);

  const now = useClock();
  const weather = useWeather();

  // Pull data every 5 minutes; endpoints are PUBLIC-safe or use anonymous limits.
  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get(`${API}/kiosk/news`, { timeout: 5000 });
        setNews((res.data?.data || res.data || []).slice(0, 5));
      } catch {
        setNews([]);
      }
      try {
        const res = await axios.get(`${API}/kiosk/veille`, { timeout: 5000 });
        setVeille((res.data?.data || res.data || []).slice(0, 5));
      } catch {
        setVeille([]);
      }
      try {
        const res = await axios.get(`${API}/kiosk/stats`, { timeout: 5000 });
        if (res.data) {
          setIndicators([
            { label: 'Incidents ouverts', value: res.data.openIncidents ?? 0, tint: 'text-amber-300' },
            { label: 'Tickets en cours', value: res.data.openTickets ?? 0, tint: 'text-blue-300' },
            { label: 'Alertes cyber (30j)', value: res.data.recentAlerts ?? 0, tint: 'text-red-300' },
            { label: 'Docs à revoir', value: res.data.docsInReview ?? 0, tint: 'text-emerald-300' },
          ]);
        }
      } catch {
        setIndicators([]);
      }
    };
    void load();
    const id = setInterval(load, 300000); // 5 min
    return () => clearInterval(id);
  }, []);

  // Rotation des slides
  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % 3), interval);
    return () => clearInterval(id);
  }, [interval]);

  return (
    <div className="fixed inset-0 bg-[#004469] text-white overflow-hidden font-body">
      {/* Header : logo + horloge + météo */}
      <header className="absolute top-0 inset-x-0 flex items-center justify-between px-16 py-10 z-10">
        <div className="flex items-center gap-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-full-white.png" alt="OMNITECH" width={200} height={48} className="h-12" />
          <div className="h-10 w-px bg-white/30" />
          <p className="text-xs uppercase tracking-[0.4em] text-white/60">Intranet Kiosque</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-light tabular-nums">{now}</p>
          {weather && (
            <p className="text-sm text-white/70 mt-1">
              Paris · {weather.temperature}°C
            </p>
          )}
        </div>
      </header>

      {/* Slide content */}
      <main className="absolute inset-0 pt-44 pb-20 px-16">
        {slide === 0 && (
          <section className="h-full">
            <p className="text-xs uppercase tracking-[0.4em] text-[#F68D2E] mb-6">Actualités</p>
            <div className="grid grid-cols-1 gap-6">
              {news.length === 0 ? (
                <p className="text-white/40 text-lg">Aucune actualité pour le moment.</p>
              ) : (
                news.slice(0, 3).map((n) => (
                  <article
                    key={n.id}
                    className="flex items-start gap-6 pb-6 border-b border-white/10"
                  >
                    {n.coverImageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={n.coverImageUrl}
                        alt=""
                        className="h-24 w-40 object-cover rounded-lg"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <h2 className="text-3xl font-semibold leading-tight">{n.title}</h2>
                      {n.excerpt && (
                        <p className="mt-2 text-white/70 text-base line-clamp-2">{n.excerpt}</p>
                      )}
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        )}

        {slide === 1 && (
          <section className="h-full">
            <p className="text-xs uppercase tracking-[0.4em] text-[#F68D2E] mb-6">Veille cyber · CERT-FR</p>
            <div className="space-y-4">
              {veille.length === 0 ? (
                <p className="text-white/40 text-lg">Aucune alerte récente.</p>
              ) : (
                veille.slice(0, 5).map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between gap-6 py-5 border-b border-white/10"
                  >
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-medium leading-snug">{v.title}</h3>
                      <p className="text-sm text-white/50 mt-1">{v.source || 'CERT-FR'}</p>
                    </div>
                    {v.severity && (
                      <span
                        className={`px-3 py-1 rounded-full text-[10px] uppercase tracking-wider font-bold ${
                          v.severity === 'critical'
                            ? 'bg-red-500/20 text-red-300 border border-red-400/40'
                            : v.severity === 'high'
                              ? 'bg-orange-500/20 text-orange-300 border border-orange-400/40'
                              : v.severity === 'medium'
                                ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-400/40'
                                : 'bg-blue-500/20 text-blue-300 border border-blue-400/40'
                        }`}
                      >
                        {v.severity}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {slide === 2 && (
          <section className="h-full">
            <p className="text-xs uppercase tracking-[0.4em] text-[#F68D2E] mb-6">Indicateurs SMSI</p>
            <div className="grid grid-cols-2 gap-8">
              {indicators.length === 0 ? (
                <p className="text-white/40 text-lg col-span-2">Indicateurs indisponibles.</p>
              ) : (
                indicators.map((i) => (
                  <div
                    key={i.label}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-8"
                  >
                    <p className="text-sm uppercase tracking-wider text-white/50 mb-4">
                      {i.label}
                    </p>
                    <p className={`text-7xl font-light tabular-nums ${i.tint}`}>{i.value}</p>
                  </div>
                ))
              )}
            </div>
          </section>
        )}
      </main>

      {/* Footer : progress indicator */}
      <footer className="absolute bottom-0 inset-x-0 flex items-center justify-between px-16 py-6">
        <p className="text-[11px] text-white/30 uppercase tracking-widest">
          OMNITECH Security · Portail Intranet · ISO 27001
        </p>
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                slide === i ? 'bg-[#F68D2E] w-10' : 'bg-white/20 w-4'
              }`}
            />
          ))}
        </div>
      </footer>
    </div>
  );
}
