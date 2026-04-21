'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * L'ancienne page /admin/testimonials a été fusionnée dans /admin/feedback
 * (onglet "Témoignages") pour regrouper la modération avec les enquêtes de
 * satisfaction. Cette page ne fait plus que rediriger — on la garde pour ne
 * pas casser les liens historiques (bookmarks, notifications emails, etc.).
 */
export default function LegacyTestimonialsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/feedback?tab=testimonials');
  }, [router]);
  return null;
}
