import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import type { Event, Registration } from "@be-on-bsv/shared";
import { api, ApiError } from "../lib/api.js";
import { GlassCard } from "../components/GlassCard.js";
import { Button } from "../components/Button.js";
import { formatEventDateTime } from "../lib/format.js";
import { getAccessToken } from "../lib/supabase.js";
import { retryMintForRegistration, retryOrdMintForRegistration } from "../lib/wallet.js";

export function AdminRegistrations() {
  const { id } = useParams();
  const [event, setEvent] = useState<Event | null>(null);
  const [regs, setRegs] = useState<Registration[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryingOrd, setRetryingOrd] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([api.events.get(id), api.admin.listRegistrations(id)])
      .then(([e, r]) => {
        setEvent(e.event);
        setRegs(r.registrations);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "failed"));
  }, [id]);

  async function onRetry(regId: string) {
    setRetrying(regId);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("not signed in");
      const ticket = await retryMintForRegistration({ registrationId: regId, authToken: token });
      // Update the row in place with the new tx_id so the UI reflects success.
      setRegs((prev) =>
        prev
          ? prev.map((r) =>
              r.id === regId ? { ...r, tx_id: ticket.tx_id, outpoint: ticket.outpoint } : r,
            )
          : prev,
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "retry failed");
    } finally {
      setRetrying(null);
    }
  }

  async function onRetryOrd(regId: string) {
    setRetryingOrd(regId);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("not signed in");
      const ord = await retryOrdMintForRegistration({ registrationId: regId, authToken: token });
      setRegs((prev) =>
        prev
          ? prev.map((r) =>
              r.id === regId
                ? { ...r, ord_txid: ord.ord_txid, ord_outpoint: ord.ord_outpoint }
                : r,
            )
          : prev,
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "ord retry failed");
    } finally {
      setRetryingOrd(null);
    }
  }

  async function onDelete(reg: Registration) {
    const ok = window.confirm(
      `Delete registration for ${reg.email}? On-chain artifacts stay on the chain — this only removes the row.`,
    );
    if (!ok) return;
    setDeleting(reg.id);
    try {
      await api.admin.deleteRegistration(reg.id);
      setRegs((prev) => (prev ? prev.filter((r) => r.id !== reg.id) : prev));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "delete failed");
    } finally {
      setDeleting(null);
    }
  }

  async function downloadCsv() {
    if (!id) return;
    const token = await getAccessToken();
    if (!token) {
      alert("Not signed in.");
      return;
    }
    const res = await fetch(api.admin.exportUrl(id), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      alert("Export failed");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const cd = res.headers.get("Content-Disposition") ?? "";
    const match = cd.match(/filename="([^"]+)"/);
    a.download = match?.[1] ?? "registrations.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="max-w-6xl mx-auto px-6 pt-12 pb-24"
    >
      <Link to="/admin" className="text-bsva-blue hover:underline font-body text-sm mb-4 inline-block">
        ← Back to dashboard
      </Link>

      <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="font-display font-semibold text-3xl text-bsva-navy">
            {event?.title ?? "Registrations"}
          </h1>
          {event && (
            <div className="text-bsva-soft/60 font-body text-sm">
              {formatEventDateTime(event.starts_at)}
            </div>
          )}
        </div>
        <Button variant="primary" onClick={downloadCsv}>
          Download CSV
        </Button>
      </div>

      {error && <GlassCard className="p-6 text-bsva-soft/80 mb-6">{error}</GlassCard>}

      <GlassCard className="overflow-hidden">
        <table className="w-full text-sm font-body">
          <thead>
            <tr className="text-left text-bsva-soft/50 text-xs uppercase tracking-wider border-b border-bsva-grey">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Organization</th>
              <th className="px-4 py-3">Registered</th>
              <th className="px-4 py-3">TxID</th>
              <th className="px-4 py-3">Ord</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="text-bsva-soft/80">
            {regs?.map((r) => (
              <tr key={r.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                <td className="px-4 py-3 font-display font-semibold">{r.name}</td>
                <td className="px-4 py-3">{r.email}</td>
                <td className="px-4 py-3 text-bsva-soft/60">{r.organization ?? "—"}</td>
                <td className="px-4 py-3 text-bsva-soft/60">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-bsva-blue/80 truncate max-w-[180px]">
                  {r.tx_id ?? (
                    <span className="text-yellow-300 font-body not-italic">pending mint</span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-bsva-blue/80 truncate max-w-[180px]">
                  {r.ord_txid ?? (
                    <span className="text-yellow-300 font-body not-italic">pending ord</span>
                  )}
                </td>
                <td className="px-4 py-3 space-x-3 whitespace-nowrap">
                  {!r.tx_id && (
                    <button
                      onClick={() => onRetry(r.id)}
                      disabled={retrying === r.id}
                      className="text-xs font-display font-semibold text-bsva-blue hover:text-bsva-navy disabled:opacity-50"
                    >
                      {retrying === r.id ? "Retrying…" : "Retry mint"}
                    </button>
                  )}
                  {!r.ord_txid && (
                    <button
                      onClick={() => onRetryOrd(r.id)}
                      disabled={retryingOrd === r.id}
                      className="text-xs font-display font-semibold text-bsva-blue hover:text-bsva-navy disabled:opacity-50"
                    >
                      {retryingOrd === r.id ? "Retrying ord…" : "Retry ord"}
                    </button>
                  )}
                  <button
                    onClick={() => onDelete(r)}
                    disabled={deleting === r.id}
                    className="text-xs font-display font-semibold text-red-300 hover:text-red-200 disabled:opacity-50"
                  >
                    {deleting === r.id ? "Deleting…" : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
            {regs && regs.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-10 text-bsva-soft/60">
                  No registrations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </GlassCard>
    </motion.div>
  );
}
