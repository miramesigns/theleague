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
            <header className="topbar">
              <Link href="/scores" className="brand" aria-label="MFL League Companion home">
                <h1>MFL League Companion</h1>
                <p>Live board, lineup edits, and league ops.</p>
              </Link>
              <div className="topbar-actions">
                <span className="pill league-identity">
                  <Image
                    src="/the-league-2026-championship-belt.png"
                    alt="Championship belt"
                    className="league-belt"
                    width={940}
                    height={666}
                    priority
                  />
                  <span>The League 2026</span>
                </span>
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
