'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Checkbox } from '@/components/ui/controls';

export function useOrg() {
  const roles = useQuery({ queryKey: ['admin', 'roles'], queryFn: () => api('/admin/roles'), staleTime: 60_000 });
  const departments = useQuery({ queryKey: ['admin', 'departments'], queryFn: () => api('/admin/departments'), staleTime: 60_000 });
  const teams = useQuery({ queryKey: ['admin', 'teams'], queryFn: () => api('/admin/teams'), staleTime: 60_000 });
  const websites = useQuery({ queryKey: ['admin', 'websites'], queryFn: () => api('/admin/websites'), staleTime: 60_000 });
  return { roles: roles.data || [], departments: departments.data || [], teams: teams.data || [], websites: websites.data || [] };
}

export function MultiCheck({ options, value, onChange, render }) {
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
      {options.map((o) => (
        <label key={o.id} className="flex items-center gap-2 text-sm"><Checkbox checked={value.includes(o.id)} onCheckedChange={() => toggle(o.id)} />{render ? render(o) : o.name}</label>
      ))}
      {!options.length && <span className="text-sm text-muted-foreground">None available</span>}
    </div>
  );
}

// Categorical slots 1-3 of the validated reference palette; one fixed colour per website, never by rank.
export const WEBSITE_COLORS = { MPF: '#2a78d6', RMW: '#eb6834', CT: '#1baf7a' };
