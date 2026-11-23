'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { UI_KEY } from '@/lib/uiVersion';

const subs = new Set();
const read = () => { try { return localStorage.getItem(UI_KEY) === '2' ? 2 : 1; } catch { return 1; } };

/**
 * Which screens to show: 1 = before the 2.0 update (components/legacy), 2 = the new ones, null = not known yet
 * (render nothing rather than the wrong version). The signed-in account's saved choice wins over this browser's,
 * so a 2.0 install shows straight away on any browser.
 */
export function useUiVersion() {
  const local = useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, read, () => null);
  const { me, loading } = useAuth();
  const account = me?.user?.ui_version;
  // Remember it in this browser too, and drop the 1.0 colours set before first paint.
  useEffect(() => { if (account === 2 && local === 1) setUiVersion(2); }, [account, local]);
  if (local === null) return null;
  if (local === 2) return 2;
  if (loading) return null; // this browser says 1.0, but the account may say 2.0: wait for it
  return account === 2 ? 2 : 1;
}

export function setUiVersion(v) {
  try { if (v === 2) localStorage.setItem(UI_KEY, '2'); else localStorage.removeItem(UI_KEY); } catch { /* blocked */ }
  if (v === 2) document.documentElement.removeAttribute('data-ui'); else document.documentElement.dataset.ui = 'v1';
  subs.forEach((cb) => cb());
}
