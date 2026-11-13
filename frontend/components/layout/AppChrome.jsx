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

/** Toasts sit top-center on phones (clear of the bottom tab bar and the thumb) and top-right on desktop. */
export function AppToaster() {
  const mobile = useIsMobile('(max-width: 639px)');
  return (
    <Toaster
      richColors
      closeButton
      position={mobile ? 'top-center' : 'top-right'}
      offset={mobile ? 'calc(env(safe-area-inset-top) + 12px)' : undefined}
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
