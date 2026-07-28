import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Sidebar } from './Sidebar';

// Note: next/link is intentionally NOT mocked here — it renders a plain <a>
// fine in jsdom for a basic href + children case like this one.

describe('Sidebar', () => {
  const onClose = vi.fn();
  const onLogout = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
    onLogout.mockClear();
  });

  it('renders nothing in the DOM when isOpen is false', () => {
    render(<Sidebar isOpen={false} onClose={onClose} onLogout={onLogout} />);
    expect(screen.queryByText('Menu')).not.toBeInTheDocument();
  });

  it('renders the menu heading, nav link, and logout button when isOpen is true', async () => {
    render(<Sidebar isOpen={true} onClose={onClose} onLogout={onLogout} />);

    // The component delays adding the "visible" class by ~20ms, so wait for it.
    expect(await screen.findByText('Menu')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Logout')).toBeInTheDocument();
    expect(screen.getByLabelText('Close menu')).toBeInTheDocument();

    const settingsLink = document.querySelector('a[href="/settings"]');
    expect(settingsLink).toBeInTheDocument();
    expect(settingsLink).toHaveTextContent('Settings');
  });

  it('renders the OpenRouter AI and Google OAuth nav links', async () => {
    render(<Sidebar isOpen={true} onClose={onClose} onLogout={onLogout} />);
    await screen.findByText('Menu');

    expect(document.querySelector('a[href="/settings/ai"]')).toHaveTextContent('OpenRouter AI');
    expect(document.querySelector('a[href="/settings/google-oauth"]')).toHaveTextContent('Gmail Integration');
  });

  it('renders the Views group collapsed, expanding to the Tabular link on click', async () => {
    render(<Sidebar isOpen={true} onClose={onClose} onLogout={onLogout} />);
    await screen.findByText('Menu');

    const viewsToggle = screen.getByRole('button', { name: /views/i });
    expect(viewsToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Tabular')).not.toBeInTheDocument();

    fireEvent.click(viewsToggle);

    expect(viewsToggle).toHaveAttribute('aria-expanded', 'true');
    expect(document.querySelector('a[href="/views/table"]')).toHaveTextContent('Tabular');
  });

  it('calls onClose when the Tabular link is clicked', async () => {
    render(<Sidebar isOpen={true} onClose={onClose} onLogout={onLogout} />);
    await screen.findByText('Menu');

    fireEvent.click(screen.getByRole('button', { name: /views/i }));
    fireEvent.click(document.querySelector('a[href="/views/table"]') as Element);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the close (X) button is clicked', async () => {
    render(<Sidebar isOpen={true} onClose={onClose} onLogout={onLogout} />);
    await screen.findByText('Menu');

    fireEvent.click(screen.getByLabelText('Close menu'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the backdrop overlay is clicked', async () => {
    const { container } = render(<Sidebar isOpen={true} onClose={onClose} onLogout={onLogout} />);
    await screen.findByText('Menu');

    const overlay = container.querySelector('div.fixed.inset-0');
    expect(overlay).toBeInTheDocument();

    fireEvent.click(overlay as Element);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the Settings nav link is clicked', async () => {
    render(<Sidebar isOpen={true} onClose={onClose} onLogout={onLogout} />);
    await screen.findByText('Menu');

    const settingsLink = document.querySelector('a[href="/settings"]');
    expect(settingsLink).toBeInTheDocument();

    fireEvent.click(settingsLink as Element);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls both onClose and onLogout when the logout button is clicked', async () => {
    render(<Sidebar isOpen={true} onClose={onClose} onLogout={onLogout} />);
    await screen.findByText('Menu');

    fireEvent.click(screen.getByText('Logout'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('removes the sidebar from the DOM after the closing animation finishes', async () => {
    const { rerender } = render(<Sidebar isOpen={true} onClose={onClose} onLogout={onLogout} />);
    await screen.findByText('Menu');

    rerender(<Sidebar isOpen={false} onClose={onClose} onLogout={onLogout} />);

    // The exit transition takes ~300ms, so the content should still be
    // present immediately after the prop flips.
    expect(screen.getByText('Menu')).toBeInTheDocument();

    await waitFor(
      () => {
        expect(screen.queryByText('Menu')).not.toBeInTheDocument();
      },
      { timeout: 1000 },
    );
  });
});
