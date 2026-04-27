'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Rss, ExternalLink, Shield, AlertTriangle, AlertOctagon, Info, ArrowRight } from 'lucide-react';
import { logger } from '@/lib/logger';

interface FeedItem {
  title: string;
  link: string;
  source: string;
  severity: string | null;
  cveId: string | null;
}

const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api').replace(/\/api\/?$/, '/api/v1');

const severityColor: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  HIGH: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  MEDIUM: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  LOW: 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-400',
};

const sourceBadgeColor: Record<string, string> = {
  'CERT-FR': 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400',
  'ANSSI': 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
};

export function RSSFeedWidget() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/public/veille?limit=10`)
      .then(r => r.json())
      .then(d => {
        setItems((d.data || []).map((item: { title: string; sourceUrl: string; sourceName: string; severity: string | null; cveId: string | null }) => ({
          title: item.title,
          link: item.sourceUrl,
          source: item.sourceName,
          severity: item.severity,
          cveId: item.cveId,
        })));
      })
      .catch((err) => logger.error(err, { component: 'RSSFeedWidget' }))
      .finally(() => setLoading(false));
  }, []);

  const severityIcon = (s: string | null) => {
    switch (s) {
      case 'CRITICAL': return <AlertOctagon className="h-3.5 w-3.5 text-red-500" />;
      case 'HIGH': return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
      case 'MEDIUM': return <Info className="h-3.5 w-3.5 text-blue-500" />;
      default: return <Shield className="h-3.5 w-3.5 text-gray-400 dark:text-slate-500" />;
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Rss className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-seal-navy dark:text-white text-sm flex-1">Alertes cybersécurité</h3>
        <Link href="/veille" className="flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline">
          Voir tout <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4].map(i => <div key={i} className="h-12 rounded-lg bg-gray-100 dark:bg-slate-800 animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-seal-gray-500 dark:text-slate-400 py-4 text-center">Aucune alerte de sécurité disponible</p>
      ) : (
        <div className="space-y-1">
          {items.map((item, i) => (
            <a
              key={i}
              href={item.cveId ? `https://nvd.nist.gov/vuln/detail/${item.cveId}` : item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2.5 rounded-lg p-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors group"
            >
              <div className="mt-0.5 flex-shrink-0">{severityIcon(item.severity)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-seal-navy dark:text-white line-clamp-1 group-hover:text-primary transition-colors">{item.title}</p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${sourceBadgeColor[item.source] || 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-400'}`}>
                    {item.source}
                  </span>
                  {item.severity && (
                    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${severityColor[item.severity] || severityColor.LOW}`}>
                      {item.severity}
                    </span>
                  )}
                  {item.cveId && <span className="text-[10px] font-mono text-red-500 font-semibold">{item.cveId}</span>}
                  <ExternalLink className="h-2.5 w-2.5 text-seal-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
