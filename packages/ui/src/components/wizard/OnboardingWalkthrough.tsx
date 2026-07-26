'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { requestSidebarClose, requestSidebarOpen } from '@/lib/sidebar-tour';

interface WalkthroughStep {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  /** Copy used instead of `text` when the ledger is empty (a brand-new account sees no drops). */
  readonly emptyLedgerText?: string;
  /** CSS selector of the dashboard element to spotlight. Omit for a centred, target-less beat. */
  readonly target?: string;
  /** The target lives in the navigation drawer, which must be opened first on mobile. */
  readonly needsSidebar?: boolean;
}

interface OnboardingWalkthroughProps {
  isOpen: boolean;
  onFinish: () => void;
  playerName?: string;
  /** Drives the empty-ledger copy: a first-time user has no transactions to point at. */
  hasDrops?: boolean;
}

const WIZARD_NAME = 'Aldric the Wise';
const TYPEWRITER_MS = 18;
/** Breathing room around the spotlight box, in px. */
const SPOTLIGHT_PADDING = 8;
/** Keys that scroll the page and must be swallowed while the tour is on screen. */
const SCROLL_KEYS: readonly string[] = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '];
/** Below Tailwind's `md`, navigation lives in the slide-in drawer instead of the always-on sidebar. */
const MOBILE_MEDIA_QUERY = '(max-width: 767px)';
/** The drawer mounts and slides in over ~300ms, so its targets are not in the DOM on the first pass. */
const TARGET_RETRY_DELAYS_MS: readonly number[] = [80, 180, 320, 480];

const STEPS: readonly WalkthroughStep[] = [
  {
    id: 'welcome',
    title: 'A Wild Wizard Appears',
    text: 'Greetings, adventurer! I am Aldric the Wise, keeper of thy coin. Let me show thee around thy new stronghold — it shall take but a moment.',
  },
  {
    id: 'month',
    title: 'The Moon Dial',
    text: 'Every quest is logged by month. Use the arrows to travel through time and inspect the loot of ages past.',
    target: '[data-tour="month-selector"]',
  },
  {
    id: 'status',
    title: 'Thy Status Panel',
    text: 'Here lieth thy vitals: gold gained, gold spent, and thy Net Yield. Tap the Net Yield to correct thy balance when the ledger lies.',
    target: '[data-tour="status-card"]',
  },
  {
    id: 'drops',
    title: 'Recent Drops',
    text: 'Each transaction is a drop. Tap one to edit it. Dashed borders mark pending drops awaiting thy blessing — commit them with the check, banish them with the cross.',
    emptyLedgerText: 'Thy ledger is bare — every transaction thou dost log will appear here as a drop. Tap one to edit it; dashed borders mark pending drops awaiting thy blessing.',
    target: '[data-tour="drops-list"]',
  },
  {
    id: 'filters',
    title: 'Scrying Tools',
    text: 'Search by name, then narrow the hoard by vault or tag. Sort by date or amount when thy ledger grows long.',
    target: '[data-tour="drop-filters"]',
  },
  {
    id: 'menu',
    title: 'The Chapter Rune',
    text: 'Behind this rune lies thy menu — every chamber of the stronghold is reached from here. Let me name the three that matter most.',
    target: '[data-tour="sidebar-nav"]',
    needsSidebar: true,
  },
  {
    id: 'nav-settings',
    title: 'Settings',
    text: 'Settings holdeth thy preferences: hide income, switch AI entry on or off, turn on notifications, and change thy password.',
    target: '[data-tour="nav-settings"]',
    needsSidebar: true,
  },
  {
    id: 'nav-ai',
    title: 'OpenRouter AI',
    text: 'Paste an OpenRouter key here to wake the AI scribe. Then thou canst describe a purchase in plain words — "coffee, 4 gold" — and it filleth in the drop for thee.',
    target: '[data-tour="nav-ai"]',
    needsSidebar: true,
  },
  {
    id: 'nav-gmail',
    title: 'Gmail Integration',
    text: 'Link thy Gmail here and I shall read thy bank alert emails myself, making drops from them whilst thou sleepest — no quill required.',
    target: '[data-tour="nav-gmail"]',
    needsSidebar: true,
  },
  {
    id: 'done',
    title: 'Go Forth',
    text: 'Thy training is complete, adventurer. Press the + rune to record income or expense the instant it happens, guard thy budget, and prosper. I shall be near should thou need counsel.',
  },
];

interface SpotlightRect {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

export function OnboardingWalkthrough({ isOpen, onFinish, playerName, hasDrops = false }: OnboardingWalkthroughProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [typedLength, setTypedLength] = useState(0);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);

  const step = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;
  const body = useMemo(() => {
    const text = !hasDrops && step.emptyLedgerText ? step.emptyLedgerText : step.text;
    return playerName ? text.replace('adventurer!', `${playerName}!`) : text;
  }, [step, playerName, hasDrops]);
  const isTyping = typedLength < body.length;

  // Reset to the first step whenever the tour is (re)opened.
  useEffect(() => {
    if (isOpen) {
      setStepIndex(0);
      setTypedLength(0);
    }
  }, [isOpen]);

  // Typewriter reveal — one character at a time, RPG dialogue style.
  useEffect(() => {
    if (!isOpen || typedLength >= body.length) return;
    const timer = setTimeout(() => setTypedLength((n) => n + 1), TYPEWRITER_MS);
    return () => clearTimeout(timer);
  }, [isOpen, typedLength, body]);

  // Open or close the mobile drawer to match the current step. On desktop the sidebar is always
  // rendered, so the drawer is left alone.
  useEffect(() => {
    if (!isOpen || !window.matchMedia(MOBILE_MEDIA_QUERY).matches) return;
    if (step.needsSidebar) requestSidebarOpen();
    else requestSidebarClose();
  }, [isOpen, step]);

  // Always leave the drawer shut when the tour ends, whichever way it ended.
  useEffect(() => {
    if (!isOpen) return;
    return () => requestSidebarClose();
  }, [isOpen]);

  // Track the spotlighted element's position (it may move on scroll, resize, or layout shift).
  useEffect(() => {
    if (!isOpen) return;
    const selector = step.target;
    if (!selector) {
      setSpotlight(null);
      return;
    }

    // Both sidebars carry the same `data-tour` hooks and both stay mounted, so pick the one the
    // current breakpoint actually renders — the hidden one measures zero.
    const findVisibleTarget = (): Element | null =>
      Array.from(document.querySelectorAll(selector)).find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }) ?? null;

    let element: Element | null = null;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const update = () => {
      if (!element) return;
      const rect = element.getBoundingClientRect();
      setSpotlight({ top: rect.top - SPOTLIGHT_PADDING, left: rect.left - SPOTLIGHT_PADDING, width: rect.width + SPOTLIGHT_PADDING * 2, height: rect.height + SPOTLIGHT_PADDING * 2 });
    };

    const attach = (): boolean => {
      element = findVisibleTarget();
      if (!element) return false;
      element.scrollIntoView({ block: 'center', behavior: 'smooth' });
      update();
      // Re-measure once the smooth scroll has settled.
      timers.push(setTimeout(update, 400));
      return true;
    };

    if (!attach()) {
      setSpotlight(null);
      TARGET_RETRY_DELAYS_MS.forEach((delay) =>
        timers.push(
          setTimeout(() => {
            if (!element) attach();
          }, delay),
        ),
      );
    }

    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [isOpen, step]);

  // Freeze user-initiated scrolling for the duration of the tour. The input events are blocked
  // rather than setting `overflow: hidden` on the body, because the dashboard scrolls inside
  // `<main>` (not the body) and the spotlight step still needs `scrollIntoView()` to work.
  useEffect(() => {
    if (!isOpen) return;
    const blockEvent = (e: Event) => e.preventDefault();
    const blockScrollKeys = (e: KeyboardEvent) => {
      if (SCROLL_KEYS.includes(e.key)) e.preventDefault();
    };
    const options: AddEventListenerOptions = { passive: false, capture: true };
    window.addEventListener('wheel', blockEvent, options);
    window.addEventListener('touchmove', blockEvent, options);
    window.addEventListener('keydown', blockScrollKeys, true);
    return () => {
      window.removeEventListener('wheel', blockEvent, options);
      window.removeEventListener('touchmove', blockEvent, options);
      window.removeEventListener('keydown', blockScrollKeys, true);
    };
  }, [isOpen]);

  const handleAdvance = useCallback(() => {
    // First press finishes the typing, second press advances — classic JRPG behaviour.
    if (isTyping) {
      setTypedLength(body.length);
      return;
    }
    if (isLastStep) {
      onFinish();
      return;
    }
    setStepIndex((i) => i + 1);
    setTypedLength(0);
  }, [isTyping, body.length, isLastStep, onFinish]);

  const handleBack = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
    setTypedLength(0);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
        e.preventDefault();
        handleAdvance();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleBack();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onFinish();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, handleAdvance, handleBack, onFinish]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120]" role="dialog" aria-modal="true" aria-label={`${WIZARD_NAME}'s walkthrough`}>
      {/* Dimmer. When a target is spotlighted the cut-out is drawn with a huge outer box-shadow. */}
      {spotlight ? (
        <>
          {/* Swallow clicks so nothing behind the tour — a nav link, the drawer backdrop — can be hit through the cut-out. */}
          <div aria-hidden className="fixed inset-0" />
          <div
            aria-hidden
            className="pointer-events-none fixed border-4 border-primary transition-all duration-300 ease-out shadow-[0_0_0_9999px_rgba(0,0,0,0.7)]"
            style={{ top: spotlight.top, left: spotlight.left, width: spotlight.width, height: spotlight.height }}
          />
        </>
      ) : (
        <div aria-hidden className="fixed inset-0 bg-black/70 transition-opacity duration-300" />
      )}

      {/* Dialogue box — anchored to the bottom, above the mobile nav bar. */}
      <div className="fixed inset-x-0 bottom-0 px-3 pb-20 md:pb-6 md:px-8 flex justify-center pointer-events-none">
        <div className="w-full max-w-3xl pointer-events-auto bg-surface-container border-4 border-black shadow-[inset_2px_2px_0_rgba(255,255,255,0.08),inset_-2px_-2px_0_rgba(0,0,0,0.5),8px_8px_0_rgba(0,0,0,0.5)]">
          <div className="flex items-stretch gap-3 p-3 md:p-4">
            {/* Portrait */}
            <div className="shrink-0 flex flex-col items-center gap-2">
              <div className="w-14 h-14 md:w-20 md:h-20 overflow-hidden bg-primary border-4 border-black shadow-[inset_2px_2px_0_rgba(255,255,255,0.2),inset_-2px_-2px_0_rgba(0,0,0,0.4)]">
                {/* eslint-disable-next-line @next/next/no-img-element -- static export, next/image needs an optimizer */}
                <img src="/avatars/wizard_avatar.png" alt="" className="w-full h-full object-cover" />
              </div>
              <span className="hidden md:block font-label-caps text-[9px] uppercase text-outline text-center leading-tight">Aldric</span>
            </div>

            {/* Speech */}
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="flex items-center justify-between gap-2 border-b-4 border-black pb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-label-caps text-[10px] uppercase bg-primary text-on-primary border-2 border-black px-1.5 py-0.5 leading-none shrink-0">{WIZARD_NAME}</span>
                  <h3 className="font-label-caps text-outline uppercase truncate">{step.title}</h3>
                </div>
                <button
                  type="button"
                  onClick={onFinish}
                  aria-label="Skip walkthrough"
                  title="Skip"
                  className="shrink-0 flex items-center justify-center h-7 w-7 bg-surface text-on-surface border-2 border-black hover:bg-error hover:text-on-error active:translate-y-px transition-transform"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Click anywhere on the text to finish typing / advance. */}
              <button type="button" onClick={handleAdvance} className="text-left py-3 min-h-[76px] md:min-h-[68px] cursor-pointer focus:outline-none">
                <p className="font-body-sm text-on-surface leading-relaxed">
                  {body.slice(0, typedLength)}
                  {isTyping ? <span className="inline-block w-2 h-4 -mb-0.5 ml-0.5 bg-primary animate-pulse" /> : <span className="inline-block ml-1 text-primary animate-bounce">▼</span>}
                </p>
              </button>

              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t-4 border-black pt-3">
                {/* Step pips */}
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  {STEPS.map((s, i) => (
                    <span key={s.id} className={`h-2 w-2 border-2 border-black ${i === stepIndex ? 'bg-primary' : i < stepIndex ? 'bg-outline' : 'bg-surface'}`} />
                  ))}
                  <span className="font-label-caps text-[10px] text-outline uppercase ml-2">
                    {stepIndex + 1}/{STEPS.length}
                  </span>
                </div>

                <div className="ml-auto flex shrink-0 items-center gap-2">
                  {stepIndex > 0 && (
                    <button
                      type="button"
                      onClick={handleBack}
                      className="font-label-caps text-[10px] uppercase bg-surface text-on-surface border-2 border-black px-3 py-2 hover:bg-surface-container-highest active:translate-y-px transition-transform"
                    >
                      Back
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleAdvance}
                    className="flex items-center gap-1 font-label-caps text-[10px] uppercase bg-primary text-on-primary border-2 border-black px-4 py-2 shadow-[0_4px_0_#344e00] hover:bg-primary/90 active:translate-y-1 active:shadow-none transition-all"
                  >
                    {isTyping ? 'Skip' : isLastStep ? 'Begin' : 'Next'}
                    <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
