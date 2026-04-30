import { useState } from "react";
import { motion } from "framer-motion";
import { getSupabase } from "../lib/supabase.js";
import { GlassCard } from "../components/GlassCard.js";
import { Button } from "../components/Button.js";

export function AdminLogin() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const sb = getSupabase();
    if (!sb) {
      setError("Supabase client is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      setBusy(false);
      return;
    }
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/admin` },
    });
    if (error) setError(error.message);
    else setSent(true);
    setBusy(false);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-md mx-auto px-6 pt-24"
    >
      <GlassCard strong className="p-8">
        <h1 className="font-display font-semibold text-2xl text-white mb-2">Admin sign in</h1>
        <p className="text-white/60 font-body text-sm mb-6">
          We'll email you a magic link.
        </p>

        {sent ? (
          <div className="text-bsva-cyan font-body">
            Check your inbox — we sent a magic link to <strong>{email}</strong>.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white font-body placeholder:text-white/30 focus:outline-none focus:border-bsva-cyan"
            />
            {error && <div className="text-red-300 text-sm font-body">{error}</div>}
            <Button type="submit" variant="primary" className="w-full" disabled={busy}>
              {busy ? "Sending…" : "Send magic link"}
            </Button>
          </form>
        )}
      </GlassCard>
    </motion.div>
  );
}
