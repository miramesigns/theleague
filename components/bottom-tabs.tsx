"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { primaryTabs } from '@/lib/navigation';

export function BottomTabs() {
  const pathname = usePathname();

  return (
    <div className="bottom-tabs" aria-label="Primary">
      <nav>
        {primaryTabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);

          return (
            <Link key={tab.href} href={tab.href} className={`tab${active ? ' active' : ''}`}>
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
