import type { Metadata, Viewport } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';

import './globals.css';
import { AuthControls } from '@/components/auth-controls';
import { BottomTabs } from '@/components/bottom-tabs';
import { getMflSessionCookieValue } from '@/lib/mfl-session';

export const metadata: Metadata = {
  title: 'MFL League Companion',
  description: 'Phone-first fantasy football companion for MFL leagues.',
  manifest: '/manifest.webmanifest',
  applicationName: 'MFL League Companion',
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
                  src="/the-league-2026-banner.jpg"
                  alt="The League 2026 — Week 1 live fantasy football companion"
                  className="site-banner-image"
                  width={1280}
                  height={431}
                  priority
                />
              </Link>
              <div className="topbar-actions">
                <Suspense fallback={<button type="button" className="button auth-button" disabled>Sign in</button>}>
                  <AuthControls authenticated={authenticated} />
                </Suspense>
              </div>
            </header>
            {children}
          </div>
        </div>
        <BottomTabs />
      </body>
    </html>
  );
}
