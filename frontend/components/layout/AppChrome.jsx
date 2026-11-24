'use client';
import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';

/** True below the `lg` breakpoint (phones and small tablets), where the app uses its mobile chrome. */
export function useIsMobile(query = '(max-width: 1023px)') {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return mobile;
}

/**
 * Toasts: bottom-center on phones/tablets, lifted above the bottom tab bar (~68px + safe area);
 * top-right on desktop (lg+, where there is no tab bar).
 */
export function AppToaster() {
  const mobile = useIsMobile('(max-width: 1023px)');
  return (
    <Toaster
      richColors
      closeButton
      position={mobile ? 'bottom-center' : 'top-right'}
      offset={mobile ? 'calc(env(safe-area-inset-bottom) + 84px)' : undefined}
    />
  );
}

/** Registers the service worker so the CRM is installable (it is also used for push notifications). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => { /* non-fatal */ });
  }, []);
  return null;
}
