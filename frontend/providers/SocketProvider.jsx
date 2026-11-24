'use client';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from './AuthProvider';
import { markNew, badgeKeyFor } from '@/lib/newLeadBadges';

const SocketContext = createContext({ connected: false, socket: null });

const HEARTBEAT_MS = 30_000;

/** OS-level notification when this tab is in the background (only if the user already allowed notifications). */
function desktopNotify(n, onClick) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || document.visibilityState === 'visible') return;
    const note = new Notification(n.title, { body: n.body || '', tag: `lead-${n.data?.leadId}`, icon: '/icon.svg' });
    note.onclick = () => { window.focus(); onClick(); note.close(); };
  } catch { /* unsupported */ }
}

/** What this tab is showing, for the Owner's Live users page. */
function presencePayload() {
  return {
    page: window.location.pathname + window.location.search,
    title: document.title || null,
    visible: document.visibilityState === 'visible',
    platform: 'web',
  };
}

/** Real-time updates: keeps lead lists, lead pages, follow-ups and notifications fresh without a page refresh. */
export function SocketProvider({ children }) {
  const { me } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const [connected, setConnected] = useState(false);
  const [socketRef, setSocketRef] = useState(null);
  const sockRef = useRef(null);

  useEffect(() => {
    if (!me?.user?.id) return undefined;
    const url = process.env.NEXT_PUBLIC_SOCKET_URL || undefined;
    const socket = io(url, { withCredentials: true, transports: ['websocket', 'polling'] });

    const invalidateLeads = (leadId) => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      if (leadId) qc.invalidateQueries({ queryKey: ['lead', String(leadId)] });
    };

    sockRef.current = socket;
    setSocketRef(socket);
    const reportPresence = () => { if (socket.connected) socket.emit('presence:update', presencePayload()); };
    const heartbeat = setInterval(reportPresence, HEARTBEAT_MS);
    document.addEventListener('visibilitychange', reportPresence);

    socket.on('connect', () => { setConnected(true); reportPresence(); });
    socket.on('disconnect', () => setConnected(false));
    socket.on('NEW_LEAD', (l) => {
      markNew(badgeKeyFor(l));
      invalidateLeads();
      qc.invalidateQueries({ queryKey: ['pipelines'] });
      toast.info(`New ${l.website} ${l.kind || 'lead'}`, { duration: 10_000, description: l.name || l.externalLeadId, action: { label: 'Open', onClick: () => router.push(`/crm/leads/${l.id}`) } });
    });
    socket.on('LEAD_ASSIGNED', (l) => invalidateLeads(l.id));
    socket.on('LEAD_REASSIGNED', (l) => invalidateLeads(l.id));
    socket.on('LEAD_STATUS_CHANGED', (l) => invalidateLeads(l.id));
    socket.on('ASSIGNMENT_REMINDER', (r) => window.dispatchEvent(new CustomEvent('crm:ack-reminder', { detail: r })));
    socket.on('ASSIGNMENT_ACKNOWLEDGED', (a) => invalidateLeads(a.leadId));
    socket.on('FOLLOWUP_UPDATED', (f) => {
      qc.invalidateQueries({ queryKey: ['followups'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      if (f.leadId) qc.invalidateQueries({ queryKey: ['lead', String(f.leadId)] });
    });
    socket.on('NEW_NOTIFICATION', (n) => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      if (n.type === 'NEW_LEAD') return; // already shown by the NEW_LEAD event for everyone on that website
      if (n.type === 'ASSIGNMENT_REMINDER' && n.data?.needsAck) return; // shown as the reminder popup instead
      if ((n.type === 'LEAD_ASSIGNED' || n.type === 'LEAD_REASSIGNED') && n.data?.leadId) {
        qc.invalidateQueries({ queryKey: ['assignments', 'pending'] });
        desktopNotify(n, () => router.push(n.link || `/crm/leads/${n.data.leadId}`));
        if (n.data.needsAck) {
          // Someone else handed this lead over: pop the acknowledge dialog right away, no refresh needed.
          window.dispatchEvent(new CustomEvent('crm:ack-reminder', { detail: { leadId: n.data.leadId, name: n.data.name, externalLeadId: n.data.externalLeadId, remark: n.data.remark, by: n.data.by, fresh: true, reassigned: n.type === 'LEAD_REASSIGNED' } }));
          return;
        }
      }
      toast(n.title, { description: n.body || undefined, action: n.link ? { label: 'View', onClick: () => router.push(n.link) } : undefined });
    });
    socket.on('FORCE_LOGOUT', () => {
      qc.clear();
      toast.error('You were signed out', { description: 'This session was ended from another device or by an administrator.' });
      router.replace('/login');
    });

    return () => {
      clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', reportPresence);
      sockRef.current = null;
      setSocketRef(null);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [me?.user?.id, qc, router]);

  // Route change: report the new page (small delay so document.title has updated).
  useEffect(() => {
    const t = setTimeout(() => { const s = sockRef.current; if (s?.connected) s.emit('presence:update', presencePayload()); }, 300);
    return () => clearTimeout(t);
  }, [pathname]);

  return <SocketContext.Provider value={{ connected, socket: socketRef }}>{children}</SocketContext.Provider>;
}

export const useSocket = () => useContext(SocketContext);
