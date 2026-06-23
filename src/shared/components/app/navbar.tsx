'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/shared/utils/cn/cn';

const LINKS = [
  { href: '/', label: 'Board' },
  { href: '/archived', label: 'Archived' },
];

// App-wide top navigation. Highlights the active route via usePathname.
export function Navbar() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-6 border-b bg-background px-6 py-3">
      <span className="text-sm font-bold tracking-tight">Job Tracker</span>
      <div className="flex gap-4">
        {LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname === href ? 'page' : undefined}
            className={cn(
              'text-sm transition-colors hover:text-foreground',
              pathname === href ? 'font-medium text-foreground' : 'text-muted-foreground',
            )}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
