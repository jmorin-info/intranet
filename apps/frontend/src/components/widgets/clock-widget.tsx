'use client';

import React, { useState, useEffect } from 'react';
import { Clock, Globe } from 'lucide-react';

export function ClockWidget() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = time.getHours().toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const seconds = time.getSeconds().toString().padStart(2, '0');

  const dateStr = time.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="flex items-center gap-5">
      <div className="relative h-16 w-16 rounded-2xl bg-gradient-to-br from-navy/20 to-primary/20 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center shadow-sm">
        <Clock className="h-8 w-8 text-navy dark:text-blue-400" />
        <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-400 animate-pulse" />
      </div>
      <div>
        <p className="text-3xl font-semibold text-navy dark:text-white font-mono tracking-widest leading-tight">
          {hours}
          <span className="animate-pulse">:</span>
          {minutes}
          <span className="text-lg text-seal-gray-500 dark:text-slate-400 ml-0.5">:{seconds}</span>
        </p>
        <p className="text-sm text-navy/80 dark:text-slate-300 capitalize mt-0.5">{dateStr}</p>
        <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 flex items-center gap-1 mt-0.5">
          <Globe className="h-3 w-3" /> {timezone}
        </p>
      </div>
    </div>
  );
}
