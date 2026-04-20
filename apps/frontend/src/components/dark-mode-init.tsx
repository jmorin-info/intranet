'use client';

import { useEffect } from 'react';
import { useUIStore } from '@/stores/ui-store';

export function DarkModeInit() {
  const darkMode = useUIStore(s => s.darkMode);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);
  return null;
}
