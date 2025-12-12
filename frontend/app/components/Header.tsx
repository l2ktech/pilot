'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useConfigStore } from '@/app/lib/configStore';

const baseTabs = [
  { name: '控制', href: '/' },
  { name: '配置', href: '/configuration' },
  { name: '摄像头', href: '/camera' },
  { name: '日志', href: '/logs' },
  { name: '监控', href: '/monitoring' },
  { name: '设置', href: '/settings' },
];

const debugTabs = [
  { name: '性能', href: '/performance' },
  { name: '调试', href: '/debug' },
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
          <h1 className="text-xl font-bold">PAROL6 控制界面</h1>
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
