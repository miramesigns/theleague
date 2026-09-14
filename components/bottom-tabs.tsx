"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/scores', label: 'Scores' },
  { href: '/lineup', label: 'Lineup' },
  { href: '/waivers', label: 'Waivers' },
  { href: '/trades', label: 'Trades' },
  { href: '/more', label: 'More' },
];

export function BottomTabs() {
  const pathname = usePathname();

  return (
    <div className="bottom-tabs" aria-label="Primary">
      <nav>
        {tabs.map((tab) => {
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
