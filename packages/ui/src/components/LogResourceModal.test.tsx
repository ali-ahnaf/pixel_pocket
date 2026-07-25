import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// The modal imports a real API client (axios-based). Mock it so the component
// can be rendered in isolation. Tests use userId={null}, so no calls are made.
// The AI parse flow now calls `getAiCredentialStatus` (instead of the removed
// `sendPrompt`) before doing anything client-side with OpenRouter.
vi.mock('../lib/api', () => ({
  profileApi: {
    getTags: vi.fn().mockResolvedValue([]),
    getVaults: vi.fn().mockResolvedValue([]),
    getAiCredentialStatus: vi.fn(),
    createTag: vi.fn(),
    createTransaction: vi.fn(),
    parseError: vi.fn((err: unknown) => (err instanceof Error ? err.message : 'Failed to make request')),
  },
}));

// The AI parse flow also reaches into the DEK session hook and the OpenRouter
// client directly; mock both so the component can be rendered without a real
// crypto/session/network setup. Tests use userId={null}, so none of these are
// actually invoked, but the modules must resolve for the component to import.
vi.mock('../hooks/useDekSession', () => ({
  useDekSession: () => ({ dek: null, loading: false, setDek: vi.fn(), clearDek: vi.fn() }),
}));

vi.mock('../lib/crypto/ai-key', () => ({
  decryptKey: vi.fn(),
}));

vi.mock('../lib/ai/openrouter', () => ({
  chat: vi.fn(),
}));

// AI prompt entry is opt-in: the modal only offers it when the user's
// `aiTransactionEntryEnabled` preference is on and the preferences have loaded.
// Mock the hook so each test can pick the preference state it exercises without
// a real auth session / preferences request.
const displaySettings = vi.hoisted(() => ({
  showIncome: false,
  showExpense: false,
  aiTransactionEntryEnabled: false,
  loaded: true,
}));

vi.mock('../hooks/useDisplaySettings', () => ({
  useDisplaySettings: () => ({
    ...displaySettings,
    setShowIncome: vi.fn(),
    setShowExpense: vi.fn(),
    setAiTransactionEntryEnabled: vi.fn(),
  }),
}));

import { LogResourceModal } from './LogResourceModal';

describe('LogResourceModal', () => {
  const baseProps = {
    isOpen: true,
    onClose: () => {},
    userId: null,
  };

  beforeEach(() => {
    // Server default: AI entry off unless the user turns it on in Settings.
    displaySettings.aiTransactionEntryEnabled = false;
    displaySettings.loaded = true;
  });

  it('does not render anything when isOpen is false', () => {
    const { container } = render(<LogResourceModal {...baseProps} isOpen={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the modal header when isOpen is true', () => {
    render(<LogResourceModal {...baseProps} />);
    expect(screen.getByRole('heading', { name: /log new resource/i })).toBeInTheDocument();
  });

  it('shows the manual entry fields and no AI prompt when AI entry is disabled', () => {
    render(<LogResourceModal {...baseProps} />);
    expect(screen.getByPlaceholderText('e.g. Grocery run')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /manual entry/i })).not.toBeInTheDocument();
  });

  it('shows the AI prompt entry (Send) by default when AI entry is enabled', () => {
    displaySettings.aiTransactionEntryEnabled = true;
    render(<LogResourceModal {...baseProps} />);
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('e.g. Grocery run')).not.toBeInTheDocument();
  });

  it('reveals the manual entry fields when Manual Entry is toggled', () => {
    displaySettings.aiTransactionEntryEnabled = true;
    render(<LogResourceModal {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /manual entry/i }));
    expect(screen.getByPlaceholderText('e.g. Grocery run')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /expense/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /income/i })).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<LogResourceModal {...baseProps} onClose={onClose} />);
    const closeButton = container.querySelector('header button');
    expect(closeButton).not.toBeNull();
    fireEvent.click(closeButton as Element);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
