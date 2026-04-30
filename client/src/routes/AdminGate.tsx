import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { GlassCard } from "../components/GlassCard.js";
import { Button } from "../components/Button.js";

/**
 * Soft password gate in front of all `/admin/*` routes.
 *
 * Purpose: keep the dashboard out of casual view while we're shipping
 * fast. NOT a security boundary — the password is shipped in the JS
 * bundle, so anyone reading the source can extract it. The Supabase
 * magic-link login behind this gate is the actual auth; this gate just
 * stops random visitors from poking at the admin UI before that.
 *
 * Storage: localStorage. Lives until the user clears site data; revoke
 * the password by changing the constant below and shipping a new build.
 */

const ADMIN_GATE_PASSWORD = "beonbsv2026";
const STORAGE_KEY = "beonbsv-admin-gate";
const STORAGE_VALUE = "1";

function isUnlocked(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === STORAGE_VALUE;
  } catch {
    return false;
  }
}

function unlock(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, STORAGE_VALUE);
  } catch {
    // localStorage unavailable (private mode etc.) — gate stays unfilled
    // for the lifetime of this tab; user can re-enter the password.
  }
}

export function AdminGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(isUnlocked);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (unlocked) return <>{children}</>;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password === ADMIN_GATE_PASSWORD) {
      unlock();
      setUnlocked(true);
      setError(null);
    } else {
      setError("Wrong password.");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="max-w-md mx-auto px-6 pt-24"
    >
      <GlassCard strong className="p-8">
        <h1 className="font-display font-semibold text-2xl text-white mb-2">
          Internal access
        </h1>
        <p className="text-white/60 font-body text-sm mb-6">
          The admin dashboard is gated while we're in private build mode.
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            placeholder="Password"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white font-body placeholder:text-white/30 focus:outline-none focus:border-bsva-cyan focus:bg-white/10 transition-colors"
          />
          {error && (
            <div className="text-sm text-red-300 font-body">{error}</div>
          )}
          <Button type="submit" variant="primary" className="w-full">
            Unlock
          </Button>
        </form>
      </GlassCard>
    </motion.div>
  );
}
