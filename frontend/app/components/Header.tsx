'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useConfigStore } from '@/app/lib/configStore';

const baseTabs = [
  { name: 'Control', href: '/' },
  { name: 'Configuration', href: '/configuration' },
  { name: 'Camera', href: '/camera' },
  { name: 'Logs', href: '/logs' },
  { name: 'Monitoring', href: '/monitoring' },
  { name: 'Settings', href: '/settings' },
];

const debugTabs = [
  { name: 'Performance', href: '/performance' },
  { name: 'Debug', href: '/debug' },
];

export default function Header() {
  const pathname = usePathname();
  const config = useConfigStore((state) => state.config);

  // Show debug tabs (Performance, Debug) only when debug mode is enabled
  const isDebugMode = config?.ui?.debug_mode === true;
  const tabs = isDebugMode
    ? [...baseTabs, ...debugTabs]
    : baseTabs;

  return (
    <header className="border-b px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-bold">PAROL6 Control Interface</h1>
          <nav className="flex gap-2">
            {tabs.map((tab) => {
              const isActive = pathname === tab.href;
              return (
                <Link
                  key={tab.name}
                  href={tab.href}
                  className={cn(
                    'px-4 py-2 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  )}
                >
                  {tab.name}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
