'use client';

import React from 'react';
import Link from 'next/link';
import { Settings as SettingsIcon, TrendingUp, TrendingDown, KeyRound, Bell, ChevronRight, Rocket, Code, Bug, BookOpen, Sparkles, type LucideIcon } from 'lucide-react';
import { AppBar, BottomNavBar, DesktopSidebar } from '@/components';
import { useDisplaySettings } from '@/hooks/useDisplaySettings';
import { usePushNotifications } from '@/hooks/usePushNotifications';

interface SettingToggleProps {
  label: string;
  description: string;
  icon: LucideIcon;
  checked: boolean;
  onChange: (value: boolean) => void;
}

function SettingToggle({ label, description, icon: Icon, checked, onChange }: SettingToggleProps) {
  return (
    <div className="flex items-center justify-between gap-4 bg-surface p-4 border-4 border-black shadow-[inset_2px_2px_0_rgba(255,255,255,0.08),inset_-2px_-2px_0_rgba(0,0,0,0.5)]">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-10 w-10 border-2 border-black flex items-center justify-center shrink-0 bg-secondary-container">
          <Icon size={20} />
        </div>
        <div className="min-w-0">
          <p className="font-body-sm font-bold text-on-surface truncate">{label}</p>
          <p className="text-[12px] text-on-surface-variant truncate">{description}</p>
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-16 shrink-0 border-4 border-black transition-colors active:translate-y-0.5 ${checked ? 'bg-primary' : 'bg-surface-container-highest'}`}
      >
        <span className={`absolute top-0 bottom-0 my-auto h-5 w-5 bg-surface border-2 border-black transition-all ${checked ? 'right-0.5' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

interface SettingLinkProps {
  label: string;
  description: string;
  icon: LucideIcon;
  href: string;
}

function SettingLink({ label, description, icon: Icon, href }: SettingLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center justify-between gap-4 bg-surface p-4 border-4 border-black shadow-[inset_2px_2px_0_rgba(255,255,255,0.08),inset_-2px_-2px_0_rgba(0,0,0,0.5)] hover:bg-primary hover:text-on-primary active:translate-y-0.5 transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-10 w-10 border-2 border-black flex items-center justify-center shrink-0 bg-secondary-container">
          <Icon size={20} />
        </div>
        <div className="min-w-0">
          <p className="font-body-sm font-bold truncate">{label}</p>
          <p className="text-[12px] text-on-surface-variant truncate group-hover:text-on-primary">{description}</p>
        </div>
      </div>

      <ChevronRight className="shrink-0" />
    </a>
  );
}

export default function SettingsPage() {
  const { showIncome, showExpense, aiTransactionEntryEnabled, setShowIncome, setShowExpense, setAiTransactionEntryEnabled } = useDisplaySettings();
  const { supported: pushSupported, subscribed: pushSubscribed, loading: pushLoading, enable: enablePush, disable: disablePush } = usePushNotifications();

  return (
    <div className="bg-background text-on-background font-body-lg min-h-screen flex flex-col md:flex-row overflow-x-hidden selection:bg-primary selection:text-on-primary">
      <AppBar />

      <DesktopSidebar />

      <main className="flex-1 flex flex-col w-full md:h-screen relative px-3 md:px-0 pb-24 md:pb-0 overflow-y-auto overflow-x-hidden">
        <div className="w-full p-margin-mobile md:p-8 flex flex-col gap-stack-md">
          <section className="flex items-center gap-3 bg-surface-container border-4 border-black p-4 shadow-[inset_2px_2px_0_rgba(255,255,255,0.08),inset_-2px_-2px_0_rgba(0,0,0,0.5)]">
            <SettingsIcon className="text-primary" />
            <h1 className="font-headline-md text-primary tracking-tight">SETTINGS</h1>
          </section>

          <section className="flex flex-col gap-stack-md bg-surface-container border-4 border-black p-4">
            <h2 className="font-label-caps text-outline uppercase border-b-4 border-black pb-2">Dashboard Visibility</h2>

            <SettingToggle label="Show Income" description="Reveal Loot Gained on the home dashboard" icon={TrendingUp} checked={showIncome} onChange={setShowIncome} />

            <SettingToggle label="Show Expense" description="Reveal Gold Spent on the home dashboard" icon={TrendingDown} checked={showExpense} onChange={setShowExpense} />
          </section>

          <section className="flex flex-col gap-stack-md bg-surface-container border-4 border-black p-4">
            <h2 className="font-label-caps text-outline uppercase border-b-4 border-black pb-2">Transaction Entry</h2>

            <SettingToggle
              label="Enable AI transaction entry"
              description="Open the log modal on the AI prompt instead of the manual form"
              icon={Sparkles}
              checked={aiTransactionEntryEnabled}
              onChange={setAiTransactionEntryEnabled}
            />
          </section>

          <section className="flex flex-col gap-stack-md bg-surface-container border-4 border-black p-4">
            <h2 className="font-label-caps text-outline uppercase border-b-4 border-black pb-2">Account</h2>

            {pushSupported && (
              <SettingToggle
                label="Push Notifications"
                description="Get notified when a Gmail watcher logs a transaction"
                icon={Bell}
                checked={pushSubscribed}
                onChange={(value) => {
                  if (pushLoading) return;
                  (value ? enablePush() : disablePush()).catch(() => undefined);
                }}
              />
            )}

            <Link
              href="/change-password"
              className="group flex items-center justify-between gap-4 bg-surface p-4 border-4 border-black shadow-[inset_2px_2px_0_rgba(255,255,255,0.08),inset_-2px_-2px_0_rgba(0,0,0,0.5)] hover:bg-primary hover:text-on-primary active:translate-y-0.5 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 border-2 border-black flex items-center justify-center shrink-0 bg-secondary-container">
                  <KeyRound size={20} />
                </div>

                <div className="min-w-0">
                  <p className="font-body-sm font-bold truncate">Change Password</p>
                  <p className="text-[12px] text-on-surface-variant truncate group-hover:text-on-primary">Update your secret passphrase</p>
                </div>
              </div>

              <ChevronRight className="shrink-0" />
            </Link>
          </section>

          {/* Community Section */}
          <section className="flex flex-col gap-stack-md bg-surface-container border-4 border-black p-4">
            <h2 className="font-label-caps text-outline uppercase border-b-4 border-black pb-2">Community</h2>

            <SettingLink label="Request a Feature" description="Suggest a new feature" icon={Rocket} href="https://github.com/ali-ahnaf/pocket_pixel/issues/new" />

            <SettingLink label="Contribute on GitHub" description="View the project repository" icon={Code} href="https://github.com/ali-ahnaf/pocket_pixel" />

            <SettingLink label="Report a Bug" description="Report a problem" icon={Bug} href="https://github.com/ali-ahnaf/pocket_pixel/issues/new" />

            <Link
              href="/settings/attributions"
              className="group flex items-center justify-between gap-4 bg-surface p-4 border-4 border-black shadow-[inset_2px_2px_0_rgba(255,255,255,0.08),inset_-2px_-2px_0_rgba(0,0,0,0.5)] hover:bg-primary hover:text-on-primary active:translate-y-0.5 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 border-2 border-black flex items-center justify-center shrink-0 bg-secondary-container">
                  <BookOpen size={20} />
                </div>

                <div className="min-w-0">
                  <p className="font-body-sm font-bold truncate">Attributions</p>
                  <p className="text-[12px] text-on-surface-variant truncate">Third-party libraries and assets</p>
                </div>
              </div>

              <ChevronRight className="shrink-0" />
            </Link>
          </section>
        </div>
      </main>

      <BottomNavBar />
    </div>
  );
}
