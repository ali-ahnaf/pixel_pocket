'use client';

import { useState } from 'react';
import { Mail } from 'lucide-react';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const validate = () => {
    if (!email) return 'Required';
    if (!/\S+@\S+\.\S+/.test(email)) return 'Invalid email';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const err = validate();
    if (err) return setError(err);

    setError(null);
    setLoading(true);

    try {
      // MOCK API CALL (frontend only)
      await new Promise((r) => setTimeout(r, 800));

      setMessage('Reset link sent to your email!');
    } catch {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-on-background flex items-center justify-center p-4">
      {/* scanline */}
      <div className="pointer-events-none fixed inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,0,0,0.08)_2px,rgba(0,0,0,0.08)_4px)] z-0" />

      <div className="relative z-10 w-full max-w-sm flex flex-col gap-6">
        {/* Card */}
        <div className="bg-surface-container-high border-4 border-black shadow-[6px_6px_0_0_rgba(0,0,0,1)]">
          {/* Header */}
          <div className="px-6 py-4 border-b-4 border-black bg-surface-container flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            <h2 className="font-headline-sm text-primary uppercase tracking-wider">Forgot Password</h2>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit} className="px-6 py-6 flex flex-col gap-5">
            <Input
              label="Email Address"
              type="email"
              placeholder="hero@guild.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              error={error || undefined}
              autoComplete="email"
            />

            {message && <p className="font-body-sm text-primary text-center">{message}</p>}

            <Button type="submit" disabled={loading} className="w-full py-3" variant="primary">
              Send Reset Link
            </Button>

            <BackButton href="/signin" label="Back to Login" variant="subtle" />
          </form>
        </div>
      </div>
    </div>
  );
}
