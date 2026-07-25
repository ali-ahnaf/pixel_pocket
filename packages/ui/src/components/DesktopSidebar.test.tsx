import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopSidebar } from './DesktopSidebar';

const { replaceMock, signOutMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
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
});
