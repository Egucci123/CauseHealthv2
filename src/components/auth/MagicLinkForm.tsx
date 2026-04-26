// src/components/auth/MagicLinkForm.tsx
// Email-only magic link signup/signin. Zero-friction auth.

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { useAuthStore } from '../../store/authStore';

export const MagicLinkForm = ({ onClose }: { onClose?: () => void }) => {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signInWithMagicLink = useAuthStore((s) => s.signInWithMagicLink);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    const { error: err } = await signInWithMagicLink(email.trim());
    setLoading(false);
    if (err) setError(err);
    else setSent(true);
  };

  return (
    <div className="bg-clinical-cream/60 border border-outline-variant/20 rounded-[10px] p-5">
      <AnimatePresence mode="wait">
        {!sent ? (
          <motion.form
            key="form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onSubmit={handleSubmit}
            className="space-y-3"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-primary-container text-[18px]">mail</span>
              <p className="text-precision text-[0.68rem] text-clinical-stone tracking-widest uppercase font-bold">
                Sign in with email link
              </p>
            </div>
            <p className="text-body text-clinical-stone text-xs leading-relaxed">
              Enter your email and we'll send you a one-tap login link. No password required.
            </p>
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
            {error && <p className="text-precision text-[0.68rem] text-[#C94F4F]">{error}</p>}
            <div className="flex items-center gap-2">
              <Button type="submit" variant="primary" size="md" loading={loading} className="flex-1 justify-center">
                Send Magic Link
              </Button>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="text-precision text-[0.68rem] text-clinical-stone hover:text-clinical-charcoal tracking-widest uppercase px-3 py-2"
                >
                  Cancel
                </button>
              )}
            </div>
          </motion.form>
        ) : (
          <motion.div
            key="sent"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-2"
          >
            <span className="material-symbols-outlined text-primary-container text-3xl mb-2 block">mark_email_read</span>
            <p className="text-authority text-base text-clinical-charcoal font-bold mb-1">Check your email.</p>
            <p className="text-body text-clinical-stone text-xs leading-relaxed">
              We sent a sign-in link to <span className="font-semibold text-clinical-charcoal">{email}</span>. Tap it from your phone or computer.
            </p>
            <button
              onClick={() => { setSent(false); setEmail(''); }}
              className="text-precision text-[0.68rem] text-primary-container font-bold tracking-widest uppercase mt-3 hover:underline"
            >
              Use a different email
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
