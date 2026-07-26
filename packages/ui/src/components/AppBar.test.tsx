import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppBar } from './AppBar';
import { AUTH_TOKEN_STORAGE_KEY } from '@/lib/api/ApiClient';
import { SIDEBAR_TOUR_CLOSE_EVENT, SIDEBAR_TOUR_OPEN_EVENT } from '@/lib/sidebar-tour';

const { replaceMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

describe('AppBar', () => {
  beforeEach(() => {
    localStorage.clear();
    replaceMock.mockReset();
  });

  it('renders the app title and user controls', () => {
    render(<AppBar />);

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /pocket pixel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open menu/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open user menu/i })).toBeInTheDocument();
  });

  it('opens the sidebar when the menu button is clicked', () => {
    render(<AppBar />);

    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));

    expect(screen.getByRole('heading', { name: /menu/i })).toBeInTheDocument();
  });

  it('shows the logout action and clears storage on logout', () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'token');
    localStorage.setItem('pocket_pixel_profile', JSON.stringify({ avatar: '/avatar.png' }));

    render(<AppBar />);

    fireEvent.click(screen.getByRole('button', { name: /open user menu/i }));
    fireEvent.click(screen.getByRole('button', { name: /logout/i }));

    expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem('pocket_pixel_profile')).toBeNull();
    expect(replaceMock).toHaveBeenCalledWith('/signin');
  });

  it('opens and closes the sidebar in response to the walkthrough events', async () => {
    render(<AppBar />);

    act(() => {
      window.dispatchEvent(new Event(SIDEBAR_TOUR_OPEN_EVENT));
    });
    expect(screen.getByRole('heading', { name: /menu/i })).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event(SIDEBAR_TOUR_CLOSE_EVENT));
    });
    // The drawer unmounts after its slide-out transition.
    await waitFor(() => expect(screen.queryByRole('heading', { name: /menu/i })).not.toBeInTheDocument());
  });
});
