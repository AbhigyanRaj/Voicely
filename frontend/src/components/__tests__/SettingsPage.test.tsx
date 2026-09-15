import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import SettingsPage from '../SettingsPage';

const updateProfileName = vi.fn().mockResolvedValue({ _id: 'u1', name: 'New Name', email: 'a@b.com' });

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { _id: 'u1', name: 'Test User', email: 'a@b.com', subscription: { tier: 'free' } },
    setUser: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../../lib/auth', () => ({
  updateProfileName: (...args: unknown[]) => updateProfileName(...args),
  setStoredUser: vi.fn(),
}));

const renderPage = () =>
  render(<BrowserRouter><SettingsPage /></BrowserRouter>);

describe('SettingsPage', () => {
  it('shows the account facts it cannot change', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: /^Settings$/i })).toBeInTheDocument();
    expect(screen.getByText('a@b.com')).toBeInTheDocument();
    // Billing does not exist, so the page says so rather than offering a tab.
    expect(screen.getByText(/no billing yet/i)).toBeInTheDocument();
  });

  it('only enables Save once the name actually changes', () => {
    renderPage();

    const save = screen.getByRole('button', { name: /^Save$/i });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/^Name$/i), { target: { value: 'New Name' } });
    expect(save).toBeEnabled();

    fireEvent.click(save);
    expect(updateProfileName).toHaveBeenCalledWith('New Name');
  });
});
