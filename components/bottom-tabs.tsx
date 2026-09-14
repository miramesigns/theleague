"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { primaryTabs } from '@/lib/navigation';

export function BottomTabs() {
  const pathname = usePathname();
  const [pendingNavigation, setPendingNavigation] = useState<{ href: string; from: string } | null>(null);
  const pendingHref = pendingNavigation?.from === pathname ? pendingNavigation.href : null;

  useEffect(() => {
    if (!pendingNavigation) return;

    const timeout = window.setTimeout(() => setPendingNavigation(null), 15000);
    return () => window.clearTimeout(timeout);
  }, [pendingNavigation]);

  return (
    <div className="bottom-tabs" aria-label="Primary">
      <nav>
        {primaryTabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const pending = pendingHref === tab.href;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`tab${active ? ' active' : ''}${pending ? ' pending' : ''}`}
              aria-current={active ? 'page' : undefined}
              aria-busy={pending || undefined}
              aria-disabled={pending || undefined}
              onClick={(event) => {
                if (active || pending) event.preventDefault();
              }}
              onNavigate={() => setPendingNavigation({ href: tab.href, from: pathname })}
            >
              <span>{tab.label}</span>
              {pending ? <span className="tab-spinner" aria-hidden="true" /> : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
