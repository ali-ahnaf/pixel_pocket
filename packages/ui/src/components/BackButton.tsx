'use client';

import { ButtonHTMLAttributes, MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export type BackButtonVariant = 'default' | 'subtle';

export interface BackButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  /** Text shown next to the arrow. */
  label?: string;
  /** Route to push instead of going back in history. */
  href?: string;
  variant?: BackButtonVariant;
  /** Overrides the arrow icon sizing/colour. */
  iconClassName?: string;
}

const variantClass: Record<BackButtonVariant, string> = {
  default: 'text-on-background hover:text-primary font-label-caps',
  subtle: 'text-outline hover:text-primary font-label-caps text-[11px] justify-center',
};

export function BackButton({ label = 'Back', href, variant = 'default', className, iconClassName, onClick, ...props }: BackButtonProps) {
  const router = useRouter();

  const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
    onClick?.(event);
    if (event.defaultPrevented) return;

    if (href) {
      router.push(href);
      return;
    }

    router.back();
  };

  return (
    <button type="button" onClick={handleClick} className={cn('flex items-center gap-2 tracking-wider uppercase transition-colors', variantClass[variant], className)} {...props}>
      {/* Replaces (not merges) the default sizing: `cn` only joins classes, so `w-3 h-3` would lose to `w-4 h-4` in the stylesheet order. */}
      <ArrowLeft className={iconClassName ?? 'w-4 h-4'} />
      {label}
    </button>
  );
}
