'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { X, Coins, LogOut, Settings, Sparkles, ShieldCheck } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, onLogout }) => {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      const t = setTimeout(() => setIsVisible(true), 20);
      return () => clearTimeout(t);
    } else {
      setIsVisible(false);
      const t = setTimeout(() => setShouldRender(false), 300);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  if (!shouldRender) return null;

  return (
    <>
      <div className={`fixed inset-0 bg-black/70 z-[100] transition-opacity duration-300 ease-in-out ${isVisible ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} />

      <aside
        className={`fixed top-0 left-0 bottom-0 z-[110] w-72 max-w-[85vw] bg-surface-container-high border-r-4 border-black shadow-[4px_0_0_0_rgba(0,0,0,1)] flex flex-col transition-transform duration-300 ease-in-out ${
          isVisible ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <header className="flex items-center justify-between px-4 h-16 border-b-4 border-black bg-surface-container">
          <h2 className="font-headline-md font-bold uppercase tracking-tight text-primary">Menu</h2>
          <button
            onClick={onClose}
            className="w-10 h-10 bg-surface-container-highest border-4 border-black flex items-center justify-center active:translate-y-0.5 hover:bg-error-container hover:text-on-error-container transition-colors"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <nav data-tour="sidebar-nav" className="flex-1 flex flex-col p-4 gap-2 overflow-y-auto">
          <Link
            href="/settings"
            data-tour="nav-settings"
            onClick={onClose}
            className="flex items-center gap-3 p-3 text-on-surface bg-surface-container-low border-4 border-black hover:bg-primary hover:text-on-primary hover:translate-x-1 active:translate-y-0.5 transition-all"
          >
            <Settings className="w-5 h-5" />
            <span className="font-label-caps tracking-wider uppercase">Settings</span>
          </Link>

          <Link
            href="/settings/ai"
            data-tour="nav-ai"
            onClick={onClose}
            className="flex items-center gap-3 p-3 text-on-surface bg-surface-container-low border-4 border-black hover:bg-primary hover:text-on-primary hover:translate-x-1 active:translate-y-0.5 transition-all"
          >
            <Sparkles className="w-5 h-5" />
            <span className="font-label-caps tracking-wider uppercase">OpenRouter AI</span>
          </Link>

          <Link
            href="/settings/google-oauth"
            data-tour="nav-gmail"
            onClick={onClose}
            className="flex items-center gap-3 p-3 text-on-surface bg-surface-container-low border-4 border-black hover:bg-primary hover:text-on-primary hover:translate-x-1 active:translate-y-0.5 transition-all"
          >
            <ShieldCheck className="w-5 h-5" />
            <span className="font-label-caps tracking-wider uppercase">Gmail Integration</span>
          </Link>
        </nav>

        <div className="p-4 border-t-4 border-black bg-surface-container">
          <button
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="w-full flex items-center gap-3 p-3 border-4 border-black bg-error-container text-on-error-container hover:translate-x-1 active:translate-y-0.5 transition-all"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-label-caps tracking-wider uppercase">Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
};
