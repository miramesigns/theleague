import type { Metadata, Viewport } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';

import './globals.css';
import { AuthControls } from '@/components/auth-controls';
import { BottomTabs } from '@/components/bottom-tabs';
import { PullToRefresh } from '@/components/pull-to-refresh';
import { getMflSessionCookieValue } from '@/lib/mfl-session';

export const metadata: Metadata = {
  title: 'MFL League Companion',
  description: 'Phone-first fantasy football companion for MFL leagues.',
  manifest: '/manifest.webmanifest',
  applicationName: 'MFL League Companion',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'The League 2026',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#08111f',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const authenticated = Boolean(await getMflSessionCookieValue());

  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <div className="page">
            <header className="topbar site-header">
              <Link href="/scores" className="site-banner" aria-label="MFL League Companion home">
                <Image
                  src="/the-league-2026-hero-new.png"
                  alt="The League 2026 — Fantasy Football Championship"
                  className="site-banner-image"
                  width={1672}
                  height={941}
                  sizes="(max-width: 600px) 100vw, 848px"
                  preload
                />
              </Link>
              <div className="topbar-actions">
                <Suspense fallback={<span className="auth-button-slot" aria-hidden="true" />}>
                  <AuthControls authenticated={authenticated} />
                </Suspense>
              </div>
            </header>
            <PullToRefresh />
            {children}
          </div>
        </div>
        <BottomTabs />
      </body>
    </html>
  );
}
