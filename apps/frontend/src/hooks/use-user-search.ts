'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export interface SearchableUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
}

/**
 * Hook d'autocomplétion utilisateur pour les mentions @user.
 * Debounce 200ms, minimum 1 caractère.
 */
export function useUserSearch(query: string, limit = 5) {
  const [users, setUsers] = useState<SearchableUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 1) {
      setUsers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get('/users/directory', {
          params: { search: trimmed, limit },
        });
        const list = Array.isArray(data) ? data : data?.data || [];
        setUsers(list.slice(0, limit));
      } catch {
        setUsers([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query, limit]);

  return { users, loading };
}
