'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

function isTokenValid(token: string | null): boolean {
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1] || ''));
    return payload.exp * 1000 > Date.now() + 60_000;
  } catch {
    return false;
  }
}

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    router.replace(isTokenValid(token) ? '/dashboard' : '/welcome');
  }, [router]);

  // Pas de splash ici — la page de destination (AuthProvider ou /welcome)
  // affichera son propre loader. Évite le "doublon" de présentation.
  return <div className="h-screen bg-[#004469]" />;
}
