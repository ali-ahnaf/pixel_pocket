import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopSidebar } from './DesktopSidebar';

const { replaceMock, signOutMock, pathname } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  signOutMock: vi.fn(),
  pathname: { current: '/' },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    signOut: signOutMock,
  }),
}));

describe('DesktopSidebar', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    signOutMock.mockReset();
    pathname.current = '/';
  });

  it('renders correctly', () => {
    render(<DesktopSidebar name="User" email="user@example.com" avatar="/avatar.png" />);

    expect(screen.getByText('User')).toBeInTheDocument();
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
  });

  it('calls signOut and redirects to signin on logout', () => {
    render(<DesktopSidebar name="User" email="user@example.com" avatar="/avatar.png" />);

    fireEvent.click(screen.getByRole('button', { name: /logout/i }));

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith('/signin');
  });

  it('renders the OpenRouter AI and Google OAuth nav links', () => {
    render(<DesktopSidebar name="User" email="user@example.com" avatar="/avatar.png" />);

    expect(screen.getByText('OpenRouter AI').closest('a')).toHaveAttribute('href', '/settings/ai');
    expect(screen.getByText('Gmail Integration').closest('a')).toHaveAttribute('href', '/settings/google-oauth');
  });

  it('renders the Views group collapsed by default', () => {
    render(<DesktopSidebar name="User" email="user@example.com" avatar="/avatar.png" />);

    expect(screen.getByRole('button', { name: /views/i })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Tabular')).not.toBeInTheDocument();
  });

  it('reveals the Tabular sub-item when the Views group is clicked', () => {
    render(<DesktopSidebar name="User" email="user@example.com" avatar="/avatar.png" />);

    fireEvent.click(screen.getByRole('button', { name: /views/i }));

    expect(screen.getByRole('button', { name: /views/i })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Tabular').closest('a')).toHaveAttribute('href', '/views/table');
  });

  it('collapses the Views group again on a second click', () => {
    render(<DesktopSidebar name="User" email="user@example.com" avatar="/avatar.png" />);

    fireEvent.click(screen.getByRole('button', { name: /views/i }));
    fireEvent.click(screen.getByRole('button', { name: /views/i }));

    expect(screen.queryByText('Tabular')).not.toBeInTheDocument();
  });

  it('auto-expands the Views group and marks Tabular active on /views/table', () => {
    pathname.current = '/views/table';
    render(<DesktopSidebar name="User" email="user@example.com" avatar="/avatar.png" />);

    expect(screen.getByRole('button', { name: /views/i })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Tabular').closest('a')).toHaveAttribute('aria-current', 'page');
  });
});
