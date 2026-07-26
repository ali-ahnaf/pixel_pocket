'use client';

import { useEffect, useState } from 'react';
import { BookOpen, ExternalLink, Users } from 'lucide-react';
import { AppBar, BackButton, BottomNavBar, DesktopSidebar } from '@/components';

const CONTRIBUTORS_URL = 'https://api.github.com/repos/ali-ahnaf/pocket_pixel/contributors?per_page=100';
const REPO_CONTRIBUTORS_PAGE = 'https://github.com/ali-ahnaf/pocket_pixel/graphs/contributors';

interface GithubContributor {
  readonly id: number;
  readonly login: string;
  readonly html_url: string;
  readonly contributions: number;
  readonly type: string;
}

interface Rank {
  readonly name: string;
  readonly max: number;
  readonly color: string;
}

/**
 * Rank ladder mirrored from `.github/workflows/contributors.yml` so the in-app
 * roster and the README roster award the same title for the same commit count.
 * `max` is the highest commit count that still earns the rank.
 */
const RANKS: readonly Rank[] = [
  { name: 'MONK', max: 1, color: '#dd6b20' },
  { name: 'KNIGHT', max: 3, color: '#c0c0c0' },
  { name: 'MAGE', max: 5, color: '#8b5cf6' },
  { name: 'ROGUE', max: 8, color: '#2f855a' },
  { name: 'RANGER', max: 11, color: '#38a169' },
  { name: 'CLERIC', max: 15, color: '#f6e05e' },
  { name: 'BARD', max: 19, color: '#ed64a6' },
  { name: 'PALADIN', max: 24, color: '#f6ad55' },
  { name: 'WARRIOR', max: 29, color: '#e53e3e' },
  { name: 'DRUID', max: 34, color: '#48bb78' },
  { name: 'SORCERER', max: 39, color: '#9f7aea' },
  { name: 'ALCHEMIST', max: 44, color: '#319795' },
  { name: 'ARCHER', max: 49, color: '#3182ce' },
  { name: 'BERSERKER', max: 54, color: '#c53030' },
  { name: 'ENCHANTER', max: 60, color: '#6b46c1' },
];

const GUILD_MASTER: Rank = { name: 'GUILD MASTER', max: Number.POSITIVE_INFINITY, color: '#ffd700' };

const rankFor = (contributions: number): Rank => RANKS.find((rank) => contributions <= rank.max) ?? GUILD_MASTER;

type LoadState = 'loading' | 'ready' | 'error';

export default function AttributionsPage() {
  const [contributors, setContributors] = useState<GithubContributor[]>([]);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    const controller = new AbortController();

    const loadContributors = async (): Promise<void> => {
      try {
        const response = await fetch(CONTRIBUTORS_URL, { signal: controller.signal, headers: { Accept: 'application/vnd.github+json' } });
        if (!response.ok) {
          throw new Error(`GitHub responded with ${response.status}`);
        }

        const payload: GithubContributor[] = await response.json();
        const heroes = payload
          .filter((contributor) => contributor.type === 'User' && !contributor.login.endsWith('[bot]'))
          .sort((a, b) => b.contributions - a.contributions)
          .map(({ id, login, html_url, contributions, type }) => ({ id, login, html_url, contributions, type }));

        setContributors(heroes);
        setState('ready');
      } catch {
        if (controller.signal.aborted) return;
        setState('error');
      }
    };

    void loadContributors();

    return () => controller.abort();
  }, []);

  return (
    <div className="bg-background text-on-background font-body-lg min-h-screen flex flex-col md:flex-row overflow-x-hidden selection:bg-primary selection:text-on-primary">
      <AppBar />

      <DesktopSidebar />

      <main className="flex-1 flex flex-col w-full md:h-screen relative px-3 md:px-0 pb-24 md:pb-0 overflow-y-auto overflow-x-hidden">
        <div className="w-full p-margin-mobile md:p-8 flex flex-col gap-stack-md">
          <BackButton href="/settings" className="border-2 border-white mt-2 mb-2 ml-1 w-fit text-label-caps px-2 py-2" iconClassName="w-3 h-3" />

          <section className="flex items-center gap-3 bg-surface-container border-4 border-black p-4 shadow-[inset_2px_2px_0_rgba(255,255,255,0.08),inset_-2px_-2px_0_rgba(0,0,0,0.5)]">
            <div className="h-10 w-10 border-2 border-black flex items-center justify-center shrink-0 bg-secondary-container">
              <BookOpen size={20} className="text-on-secondary" />
            </div>
            <div className="min-w-0">
              <h1 className="font-headline-md text-primary">ATTRIBUTIONS</h1>
              <p className="text-[12px] text-on-surface-variant">The heroes who built Pocket Pixel</p>
            </div>
          </section>

          <section className="bg-surface-container border-4 border-black p-4 flex flex-col gap-4 shadow-[inset_2px_2px_0_rgba(255,255,255,0.08),inset_-2px_-2px_0_rgba(0,0,0,0.5)]">
            <div className="flex items-center justify-between gap-3 border-b-4 border-black pb-3">
              <h2 className="font-label-caps text-outline uppercase">Contributors</h2>
              {state === 'ready' && (
                <span className="flex items-center gap-2 bg-primary text-on-primary border-2 border-black px-2 py-1 font-label-caps uppercase shrink-0">
                  <Users size={14} />
                  {contributors.length} heroes
                </span>
              )}
            </div>

            {state === 'loading' && (
              <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
                {Array.from({ length: 9 }).map((_, index) => (
                  <div key={index} className="bg-surface border-4 border-black p-2 sm:p-3 flex flex-col items-center gap-2 animate-pulse">
                    <div className="h-12 w-12 sm:h-16 sm:w-16 border-2 border-black bg-surface-container-highest" />
                    <div className="h-3 w-3/4 bg-surface-container-highest" />
                    <div className="h-4 w-full bg-surface-container-highest" />
                  </div>
                ))}
              </div>
            )}

            {state === 'error' && (
              <div className="bg-surface border-4 border-black p-4 flex flex-col gap-3">
                <p className="font-body-sm text-on-surface">Could not reach GitHub to load the roster. It may be rate-limited — try again in a bit.</p>
                <a
                  href={REPO_CONTRIBUTORS_PAGE}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-secondary-container text-on-secondary-container border-2 border-black px-3 py-2 w-fit font-body-sm font-bold hover:bg-primary hover:text-on-primary active:translate-y-0.5 transition-colors"
                >
                  View on GitHub
                  <ExternalLink size={16} />
                </a>
              </div>
            )}

            {state === 'ready' && (
              <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
                {contributors.map((contributor) => {
                  const rank = rankFor(contributor.contributions);

                  return (
                    <a
                      key={contributor.id}
                      href={contributor.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group bg-surface border-4 border-black p-2 sm:p-3 flex flex-col items-center gap-2 shadow-[inset_2px_2px_0_rgba(255,255,255,0.08),inset_-2px_-2px_0_rgba(0,0,0,0.5)] hover:bg-surface-container-high active:translate-y-0.5 transition-colors"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- static export ships without the Next image optimizer */}
                      <img
                        src={`https://avatars.githubusercontent.com/u/${contributor.id}?s=128&v=4`}
                        alt={contributor.login}
                        width={64}
                        height={64}
                        loading="lazy"
                        className="h-12 w-12 sm:h-16 sm:w-16 border-2 border-black object-cover [image-rendering:pixelated]"
                      />

                      <p className="font-body-sm font-bold text-[11px] sm:text-[14px] text-on-surface truncate max-w-full group-hover:text-primary">{contributor.login}</p>

                      <span
                        className="w-full text-center border-2 border-black px-1 py-1 font-label-caps uppercase truncate text-black text-[8px] sm:text-[10px] leading-none"
                        style={{ backgroundColor: rank.color }}
                        title={`${contributor.contributions} commits`}
                      >
                        LVL {contributor.contributions} · {rank.name}
                      </span>
                    </a>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>

      <BottomNavBar />
    </div>
  );
}
