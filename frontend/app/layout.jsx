import { Inter } from 'next/font/google';
import { QueryProvider } from '@/providers/QueryProvider';
import { AuthProvider } from '@/providers/AuthProvider';
import { MaintenanceGate } from '@/components/MaintenanceGate';
import { AppToaster, ServiceWorkerRegister } from '@/components/layout/AppChrome';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata = {
  title: { default: 'RMW CRM', template: '%s · RMW CRM' },
  description: 'Centralised lead management for MPF, RMW and CT',
  applicationName: 'RMW CRM',
  icons: { icon: '/rmw-logo.png', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'RMW CRM', statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

// viewport-fit=cover lets the app draw under the notch; safe-area insets in CSS keep content clear of it.
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#194173',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </QueryProvider>
        <MaintenanceGate />
        <AppToaster />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
