'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from './AuthProvider';

const SocketContext = createContext({ connected: false });

/** Real-time updates: keeps lead lists, lead pages, follow-ups and notifications fresh without a page refresh. */
export function SocketProvider({ children }) {
  const { me } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!me?.user?.id) return undefined;
    const url = process.env.NEXT_PUBLIC_SOCKET_URL || undefined;
    const socket = io(url, { withCredentials: true, transports: ['websocket', 'polling'] });

    const invalidateLeads = (leadId) => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      if (leadId) qc.invalidateQueries({ queryKey: ['lead', String(leadId)] });
    };

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('NEW_LEAD', (l) => {
      invalidateLeads();
      qc.invalidateQueries({ queryKey: ['pipelines'] });
      toast.info(`New ${l.website} ${l.kind || 'lead'}`, { duration: 10_000, description: l.name || l.externalLeadId, action: { label: 'Open', onClick: () => router.push(`/crm/leads/${l.id}`) } });
    });
    socket.on('LEAD_ASSIGNED', (l) => invalidateLeads(l.id));
    socket.on('LEAD_REASSIGNED', (l) => invalidateLeads(l.id));
    socket.on('LEAD_STATUS_CHANGED', (l) => invalidateLeads(l.id));
    socket.on('FOLLOWUP_UPDATED', (f) => {
      qc.invalidateQueries({ queryKey: ['followups'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      if (f.leadId) qc.invalidateQueries({ queryKey: ['lead', String(f.leadId)] });
    });
    socket.on('NEW_NOTIFICATION', (n) => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      if (n.type === 'NEW_LEAD') return; // already shown by the NEW_LEAD event for everyone on that website
      toast(n.title, { description: n.body || undefined, action: n.link ? { label: 'View', onClick: () => router.push(n.link) } : undefined });
    });
    socket.on('FORCE_LOGOUT', () => {
      qc.clear();
      toast.error('You were signed out', { description: 'This session was ended from another device or by an administrator.' });
      router.replace('/login');
    });

    return () => { socket.removeAllListeners(); socket.disconnect(); };
  }, [me?.user?.id, qc, router]);

  return <SocketContext.Provider value={{ connected }}>{children}</SocketContext.Provider>;
}

export const useSocket = () => useContext(SocketContext);
