import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackButton } from './BackButton';

const { backMock, pushMock } = vi.hoisted(() => ({
  backMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    back: backMock,
    push: pushMock,
  }),
}));

describe('BackButton', () => {
  beforeEach(() => {
    backMock.mockReset();
    pushMock.mockReset();
  });

  it('renders the default label', () => {
    render(<BackButton />);
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('renders a custom label', () => {
    render(<BackButton label="Back to Login" />);
    expect(screen.getByRole('button', { name: 'Back to Login' })).toBeInTheDocument();
  });

  it('goes back in history when no href is given', () => {
    render(<BackButton />);

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(backMock).toHaveBeenCalledTimes(1);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('pushes the href when one is given', () => {
    render(<BackButton href="/signin" />);

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(pushMock).toHaveBeenCalledWith('/signin');
    expect(backMock).not.toHaveBeenCalled();
  });

  it('calls a custom onClick before navigating', () => {
    const handleClick = vi.fn();
    render(<BackButton onClick={handleClick} />);

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(backMock).toHaveBeenCalledTimes(1);
  });

  it('skips navigation when the custom onClick prevents the default', () => {
    render(<BackButton onClick={(event) => event.preventDefault()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(backMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('replaces the default icon sizing when iconClassName is given', () => {
    const { container } = render(<BackButton iconClassName="w-3 h-3" />);
    const icon = container.querySelector('svg');

    expect(icon).toHaveClass('w-3', 'h-3');
    expect(icon).not.toHaveClass('w-4');
  });

  it('applies the subtle variant classes and merges a custom className', () => {
    render(<BackButton variant="subtle" className="w-full" />);
    const button = screen.getByRole('button', { name: 'Back' });

    expect(button).toHaveClass('text-outline', 'justify-center', 'w-full');
  });
});
