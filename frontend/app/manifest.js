/** Web app manifest: lets the CRM be installed to a phone's home screen and open full-screen like an app. */
export default function manifest() {
  return {
    name: 'RMW CRM',
    short_name: 'RMW CRM',
    description: 'Centralised lead management for MPF, RMW and CT',
    id: '/crm/dashboard',
    start_url: '/crm/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f5f7fb',
    theme_color: '#194173',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'All leads', url: '/crm/leads' },
      { name: 'Follow-ups', url: '/crm/followups' },
      { name: 'Notifications', url: '/crm/notifications' },
    ],
  };
}
