'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Menu, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from './Button';
import { Sidebar } from './Sidebar';
import { useAuth } from '@/hooks/useAuth';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { OUTBOX_CHANGED_EVENT, peekAll } from '@/lib/offline/outbox';
import { SIDEBAR_TOUR_CLOSE_EVENT, SIDEBAR_TOUR_OPEN_EVENT } from '@/lib/sidebar-tour';

export const AppBar: React.FC = () => {
  const { user, signOut } = useAuth();
  const isOnline = useOnlineStatus();
  const [queuedCount, setQueuedCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  // The onboarding walkthrough drives the drawer so it can spotlight the nav items inside it.
  useEffect(() => {
    const open = () => setSidebarOpen(true);
    const close = () => setSidebarOpen(false);
    window.addEventListener(SIDEBAR_TOUR_OPEN_EVENT, open);
    window.addEventListener(SIDEBAR_TOUR_CLOSE_EVENT, close);
    return () => {
      window.removeEventListener(SIDEBAR_TOUR_OPEN_EVENT, open);
      window.removeEventListener(SIDEBAR_TOUR_CLOSE_EVENT, close);
    };
  }, []);

  // Queued writes are the only thing the offline banner needs from the outbox,
  // and the count changes from anywhere (a form, the sync loop), hence the event.
  useEffect(() => {
    const update = () => setQueuedCount(peekAll().length);
    update();
    window.addEventListener(OUTBOX_CHANGED_EVENT, update);
    return () => window.removeEventListener(OUTBOX_CHANGED_EVENT, update);
  }, []);

  const handleLogout = () => {
    signOut();
    router.replace('/signin');
  };

  const displayAvatarUrl = user?.avatar || '/avatars/avatar1.jpeg';

  return (
    <>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} onLogout={handleLogout} />
      {/* Shown at every breakpoint: without it, the stale numbers on screen read as a bug.
          Pages lay AppBar out in a column on mobile but a row from `md` up, so the banner
          leaves the flow on desktop instead of stealing a column beside the sidebar. It is
          purely informational, hence pointer-events-none. */}
      {!isOnline && (
        <div
          role="status"
          className="w-full bg-secondary-container text-on-secondary-container border-b-4 border-black px-4 py-1.5 font-label-caps text-[11px] uppercase text-center pointer-events-none md:fixed md:inset-x-0 md:top-0 md:z-[60]"
        >
          {queuedCount > 0 ? `Offline — ${queuedCount} change${queuedCount === 1 ? '' : 's'} will sync later` : 'Offline — changes will sync later'}
        </div>
      )}
      <header className="md:hidden bg-surface dark:bg-surface-dim text-primary dark:text-primary-fixed w-full border-b-4 border-black flex justify-between items-center px-margin-mobile px-4 h-16 sticky top-0 z-40">
        <Button variant="ghost" className="p-2 w-10 h-10 border-transparent bg-surface-container" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
          <Menu />
        </Button>
        <h1 className="font-headline-md font-bold uppercase tracking-tight text-primary text-center flex-1">Pocket Pixel</h1>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="h-10 w-10 border-4 border-black shadow-[inset_-2px_-2px_0px_0px_rgba(0,0,0,0.3),_inset_2px_2px_0px_0px_rgba(255,255,255,0.2)] rounded-none bg-secondary-container overflow-hidden flex items-center justify-center shrink-0 focus:outline-none"
            aria-label="Open user menu"
          >
            <img alt="User Hero" className="object-cover w-full h-full [image-rendering:pixelated]" src={displayAvatarUrl} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-[calc(100%+8px)] w-40 bg-surface border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] z-50">
              <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2 text-sm font-bold uppercase tracking-wide text-error hover:bg-error-container transition-colors">
                <LogOut size={14} />
                Logout
              </button>
            </div>
          )}
        </div>
      </header>
    </>
  );
};
