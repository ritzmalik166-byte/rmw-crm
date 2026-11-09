'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Statuses, sources, accessible websites and assignable users. */
export function useLookups() {
  return useQuery({ queryKey: ['lookups'], queryFn: () => api('/crm/lookups'), staleTime: 5 * 60_000 });
}
