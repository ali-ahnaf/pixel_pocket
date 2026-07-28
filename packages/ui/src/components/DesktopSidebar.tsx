'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Home, BarChart, User, Coins, LogOut, Settings, Sparkles, ShieldCheck, LayoutGrid, Table2, ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

const PROFILE_STORAGE_KEY = 'pocket_pixel_profile';

interface NavLink {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Hook for the onboarding walkthrough to spotlight this entry. */
  tourId?: string;
}

interface NavGroup {
  label: string;
  icon: LucideIcon;
  /** Every child href shares this prefix, so the group can auto-expand on the active route. */
  prefix: string;
  children: NavLink[];
}

type NavEntry = NavLink | NavGroup;

const isGroup = (entry: NavEntry): entry is NavGroup => 'children' in entry;

const NAV_ITEMS: NavEntry[] = [
  { label: 'Home', href: '/', icon: Home },
  { label: 'Stats', href: '/stats', icon: BarChart },
  { label: 'Views', icon: LayoutGrid, prefix: '/views', children: [{ label: 'Tabular', href: '/views/table', icon: Table2 }] },
  { label: 'Profile', href: '/profile', icon: User },
  { label: 'Debts', href: '/debts', icon: Coins },
  { label: 'Settings', href: '/settings', icon: Settings, tourId: 'nav-settings' },
  { label: 'OpenRouter AI', href: '/settings/ai', icon: Sparkles, tourId: 'nav-ai' },
  { label: 'Gmail Integration', href: '/settings/google-oauth', icon: ShieldCheck, tourId: 'nav-gmail' },
];

const ALL_HREFS = NAV_ITEMS.flatMap((entry) => (isGroup(entry) ? entry.children.map((child) => child.href) : [entry.href]));

interface DesktopSidebarProps {
  name?: string;
  email?: string;
  avatar?: string;
}

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({ name, email, avatar }) => {
  const [storedProfile, setStoredProfile] = useState<{ name?: string; email?: string; avatar?: string } | null>(null);
  const [hasCheckedStorage, setHasCheckedStorage] = useState(false);
  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const rawPathname = usePathname();
  const pathname = rawPathname?.replace('/\/$/', '') || '/';
  const router = useRouter();
  const { signOut } = useAuth();

  useEffect(() => {
    const stored = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (stored) {
      try {
        setStoredProfile(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse profile from localStorage', e);
      }
    }
    setHasCheckedStorage(true);
  }, []);

  const displayName = name ?? storedProfile?.name ?? '...';
  const displayEmail = email ?? storedProfile?.email ?? '';
  const resolvedAvatar = avatar ?? storedProfile?.avatar;
  // Don't fall back to the default until we've read localStorage, so a page
  // refresh doesn't flash avatar1 before the real avatar resolves.
  const avatarSrc = resolvedAvatar ?? (hasCheckedStorage ? '/avatars/avatar1.jpeg' : undefined);
  const showAvatarSkeleton = !hasCheckedStorage || !avatarLoaded;

  // Nested routes (/settings/ai) also prefix-match their parent (/settings), so
  // only the longest matching href is highlighted.
  const activeHref = ALL_HREFS.filter((href) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`))).sort((a, b) => b.length - a.length)[0];

  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  // Groups stay collapsed by default, but open themselves when the route they own is active.
  useEffect(() => {
    const activeGroup = NAV_ITEMS.find((entry): entry is NavGroup => isGroup(entry) && (pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`)));
    if (activeGroup) setExpandedGroups((groups) => (groups.includes(activeGroup.label) ? groups : [...groups, activeGroup.label]));
  }, [pathname]);

  const toggleGroup = (label: string) => setExpandedGroups((groups) => (groups.includes(label) ? groups.filter((g) => g !== label) : [...groups, label]));

  const handleLogout = () => {
    signOut();
    router.replace('/signin');
  };

  return (
    <aside className="hidden md:flex flex-col h-screen w-80 border-r-4 border-4 border-black border-black bg-surface-container dark:bg-surface-container-high sticky top-0 z-50">
      <div className="p-4 border-b-4 border-black flex items-center gap-4 bg-surface-container-low">
        <div className="relative h-16 w-16 border-4 border-black shadow-[inset_-2px_-2px_0px_0px_rgba(0,0,0,0.3),_inset_2px_2px_0px_0px_rgba(255,255,255,0.2)] rounded-none bg-secondary-container overflow-hidden shrink-0">
          {showAvatarSkeleton && <div className="absolute inset-0 animate-pulse bg-surface-container-highest" />}
          {avatarSrc && (
            <img
              alt="Player Avatar"
              className={`object-cover w-full h-full [image-rendering:pixelated] transition-opacity duration-200 ${avatarLoaded ? 'opacity-100' : 'opacity-0'}`}
              src={avatarSrc}
              onLoad={() => setAvatarLoaded(true)}
              onError={() => setAvatarLoaded(true)}
            />
          )}
        </div>
        <div className="flex flex-col overflow-hidden">
          <h2 className="font-headline-md text-primary truncate">{displayName}</h2>
          <p className="font-body-sm text-on-surface-variant truncate">{displayEmail}</p>
        </div>
      </div>

      <nav data-tour="sidebar-nav" className="flex-1 flex flex-col p-4 gap-2 overflow-y-auto">
        {NAV_ITEMS.map((entry) => {
          const Icon = entry.icon;

          if (isGroup(entry)) {
            const isExpanded = expandedGroups.includes(entry.label);
            const hasActiveChild = entry.children.some((child) => child.href === activeHref);
            return (
              <div key={entry.label} className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => toggleGroup(entry.label)}
                  aria-expanded={isExpanded}
                  className={`flex items-center gap-3 p-3 text-left transition-transform border-4 ${
                    hasActiveChild
                      ? 'border-black bg-surface-container-highest text-on-surface'
                      : 'border-transparent text-on-surface hover:bg-surface-container-highest hover:translate-x-1 hover:border-black'
                  }`}
                >
                  <Icon />
                  <span className="flex-1 font-label-caps text-sm tracking-wider uppercase font-bold">{entry.label}</span>
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>

                {isExpanded && (
                  <div className="flex flex-col gap-2 pl-6">
                    {entry.children.map((child) => {
                      const ChildIcon = child.icon;
                      const isActive = child.href === activeHref;
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          data-tour={child.tourId}
                          aria-current={isActive ? 'page' : undefined}
                          className={
                            isActive
                              ? 'flex items-center gap-3 p-3 bg-primary text-on-primary border-4 border-primary-container'
                              : 'flex items-center gap-3 p-3 text-on-surface hover:bg-surface-container-highest hover:translate-x-1 active:scale-95 transition-transform border-4 border-transparent hover:border-black'
                          }
                        >
                          <ChildIcon className="w-5 h-5" />
                          <span className={`font-label-caps text-sm tracking-wider uppercase ${isActive ? 'font-black' : 'font-bold'}`}>{child.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const isActive = entry.href === activeHref;
          return (
            <Link
              key={entry.href}
              href={entry.href}
              data-tour={entry.tourId}
              aria-current={isActive ? 'page' : undefined}
              className={
                isActive
                  ? 'flex items-center gap-3 p-3 bg-primary text-on-primary border-4 border-primary-container'
                  : 'flex items-center gap-3 p-3 text-on-surface hover:bg-surface-container-highest hover:translate-x-1 active:scale-95 transition-transform border-4 border-transparent hover:border-black'
              }
            >
              <Icon />
              <span className={`font-label-caps text-sm tracking-wider uppercase ${isActive ? 'font-black' : 'font-bold'}`}>{entry.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t-4 border-black bg-surface-container">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 p-3 border-4 border-black bg-error-container text-on-error-container hover:translate-x-1 active:translate-y-0.5 transition-all"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-label-caps tracking-wider uppercase">Logout</span>
        </button>
      </div>
    </aside>
  );
};
