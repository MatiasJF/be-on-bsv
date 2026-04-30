import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import type { EventInput, EventSpeaker } from "@be-on-bsv/shared";
import { api, ApiError } from "../lib/api.js";
import { GlassCard } from "../components/GlassCard.js";
import { Button } from "../components/Button.js";
import { RichTextEditor } from "../components/RichTextEditor.js";

interface AdminEventFormProps {
  mode: "create" | "edit";
}

/** Keep in sync with the server-side multer limit in routes/events.ts. */
const MAX_COVER_BYTES = 10 * 1024 * 1024; // 10 MB

const emptySpeaker = (position: number): EventSpeaker => ({
  name: "",
  bio: null,
  avatar_url: null,
  role: position === 0 ? "host" : "speaker",
  position,
});

const empty: EventInput = {
  title: "",
  description: "",
  starts_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  ends_at: null,
  location: "",
  is_virtual: true,
  meeting_url: null,
  cover_url: null,
  tags: [],
  speakers: [],
};

export function AdminEventForm({ mode }: AdminEventFormProps) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<EventInput>(empty);
  const [speakers, setSpeakers] = useState<EventSpeaker[]>([]);
  const [tagsInput, setTagsInput] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "edit" || !id) return;
    api.admin.getEvent(id).then((r) => {
      setForm({
        title: r.event.title,
        description: r.event.description,
        starts_at: r.event.starts_at,
        ends_at: r.event.ends_at ?? null,
        location: r.event.location ?? "",
        is_virtual: r.event.is_virtual,
        meeting_url: r.event.meeting_url ?? null,
        cover_url: r.event.cover_url ?? null,
        tags: r.event.tags,
        speakers: r.event.speakers,
      });
      setSpeakers(r.event.speakers);
      setTagsInput(r.event.tags.join(", "));
    });
  }, [mode, id]);

  function update<K extends keyof EventInput>(key: K, value: EventInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setCoverError(null);
    if (!file) {
      setCoverFile(null);
      return;
    }
    if (file.size > MAX_COVER_BYTES) {
      setCoverError(
        `"${file.name}" is ${formatBytes(file.size)} — the cover image limit is ${formatBytes(MAX_COVER_BYTES)}.`,
      );
      setCoverFile(null);
      e.target.value = "";
      return;
    }
    setCoverFile(file);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (coverError) return;
    setBusy(true);
    setError(null);

    // Filter out speakers rows that were left blank (name is required),
    // and normalize positions to the array index.
    const cleanSpeakers: EventSpeaker[] = speakers
      .filter((s) => s.name.trim().length > 0)
      .map((s, i) => ({
        ...s,
        name: s.name.trim(),
        bio: s.bio ? s.bio.toString().trim() || null : null,
        avatar_url: s.avatar_url || null,
        role: s.role || "speaker",
        position: i,
      }));

    const payload: EventInput = {
      ...form,
      tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
      speakers: cleanSpeakers,
    };

    try {
      if (mode === "create") {
        await api.admin.createEvent(payload, coverFile ?? undefined);
      } else if (id) {
        await api.admin.updateEvent(id, payload, coverFile ?? undefined);
      }
      navigate("/admin");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "save failed");
    } finally {
      setBusy(false);
    }
  }

  const startsLocal = form.starts_at ? toLocalInput(form.starts_at) : "";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="max-w-3xl mx-auto px-6 pt-12 pb-24"
    >
      <h1 className="font-display font-semibold text-3xl text-white mb-6">
        {mode === "create" ? "New event" : "Edit event"}
      </h1>

      <GlassCard className="p-6">
        <form onSubmit={onSubmit} className="space-y-5">
          <Field label="Title" required>
            <input
              type="text"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              required
              className={inputCls}
            />
          </Field>

          <Field label="Description" required>
            <RichTextEditor
              value={form.description}
              onChange={(html) => update("description", html)}
              placeholder="Tell people what they'll learn…"
            />
          </Field>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Starts at" required>
              <input
                type="datetime-local"
                value={startsLocal}
                onChange={(e) => update("starts_at", fromLocalInput(e.target.value))}
                required
                className={inputCls}
              />
            </Field>
            <Field label="Ends at (optional)">
              <input
                type="datetime-local"
                value={form.ends_at ? toLocalInput(form.ends_at) : ""}
                onChange={(e) =>
                  update("ends_at", e.target.value ? fromLocalInput(e.target.value) : null)
                }
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Location">
            <input
              type="text"
              value={form.location ?? ""}
              onChange={(e) => update("location", e.target.value)}
              placeholder="e.g. Online, or 123 Main St, City"
              className={inputCls}
            />
          </Field>

          <label className="inline-flex items-center gap-2 text-white/80 font-body text-sm">
            <input
              type="checkbox"
              checked={form.is_virtual}
              onChange={(e) => update("is_virtual", e.target.checked)}
              className="w-4 h-4 accent-bsva-blue"
            />
            Virtual event
          </label>

          {form.is_virtual && (
            <Field label="Meeting link (Zoom, Meet, Jitsi, …)">
              <input
                type="url"
                value={form.meeting_url ?? ""}
                onChange={(e) => update("meeting_url", e.target.value || null)}
                placeholder="https://…"
                className={inputCls}
              />
              <span className="block mt-1 text-xs text-white/40 font-body">
                Only sent to registrants — never shown publicly.
              </span>
            </Field>
          )}

          <Field label="Tags (comma-separated)">
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="workshop, beginner, dev"
              className={inputCls}
            />
          </Field>

          <Field label={`Cover image (max ${formatBytes(MAX_COVER_BYTES)})`}>
            <input
              type="file"
              accept="image/*"
              onChange={onCoverChange}
              className="text-white/80 font-body text-sm file:mr-4 file:px-4 file:py-2 file:rounded-full file:border-0 file:bg-bsva-blue file:text-white file:font-display file:font-semibold"
            />
            {coverFile && !coverError && (
              <div className="text-xs text-bsva-cyan font-body mt-2">
                Selected: {coverFile.name} ({formatBytes(coverFile.size)})
              </div>
            )}
            {coverError && <ErrorBanner>{coverError}</ErrorBanner>}
            {form.cover_url && !coverFile && !coverError && (
              <div className="text-xs text-white/50 font-body mt-2">
                Current: <span className="text-bsva-cyan">{form.cover_url}</span>
              </div>
            )}
          </Field>

          <SpeakersEditor speakers={speakers} setSpeakers={setSpeakers} />

          {error && <ErrorBanner>{error}</ErrorBanner>}

          <div className="flex gap-3 pt-2">
            <Button type="submit" variant="primary" disabled={busy || !!coverError}>
              {busy ? "Saving…" : mode === "create" ? "Create event" : "Save changes"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => navigate("/admin")}>
              Cancel
            </Button>
          </div>
        </form>
      </GlassCard>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// Speakers editor — add/edit/remove + reorder via up/down buttons
// ─────────────────────────────────────────────────────────────

function SpeakersEditor({
  speakers,
  setSpeakers,
}: {
  speakers: EventSpeaker[];
  setSpeakers: (list: EventSpeaker[]) => void;
}) {
  function updateRow(index: number, patch: Partial<EventSpeaker>) {
    setSpeakers(speakers.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }
  function removeRow(index: number) {
    setSpeakers(speakers.filter((_, i) => i !== index));
  }
  function moveRow(index: number, direction: -1 | 1) {
    const next = [...speakers];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setSpeakers(next);
  }
  function addRow() {
    setSpeakers([...speakers, emptySpeaker(speakers.length)]);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="block text-xs font-body text-white/60">
          Speakers ({speakers.length}/10)
        </span>
        <button
          type="button"
          onClick={addRow}
          disabled={speakers.length >= 10}
          className="text-xs text-bsva-cyan hover:text-white font-display font-semibold disabled:opacity-40"
        >
          + Add speaker
        </button>
      </div>

      {speakers.length === 0 && (
        <div className="text-sm text-white/40 font-body italic">
          No speakers yet. Click <span className="text-bsva-cyan">+ Add speaker</span> to add a host or panelist.
        </div>
      )}

      <div className="space-y-4">
        {speakers.map((s, i) => (
          <div
            key={s.id ?? `new-${i}`}
            className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-display font-semibold text-bsva-cyan uppercase tracking-wider">
                  #{i + 1}
                </span>
                <select
                  value={s.role}
                  onChange={(e) => updateRow(i, { role: e.target.value })}
                  className="bg-white/5 border border-white/10 rounded-md px-2 py-1 text-xs font-body text-white focus:outline-none focus:border-bsva-cyan"
                >
                  <option value="host">host</option>
                  <option value="speaker">speaker</option>
                  <option value="panelist">panelist</option>
                  <option value="moderator">moderator</option>
                </select>
              </div>
              <div className="flex items-center gap-1">
                <IconButton
                  title="Move up"
                  disabled={i === 0}
                  onClick={() => moveRow(i, -1)}
                >
                  ↑
                </IconButton>
                <IconButton
                  title="Move down"
                  disabled={i === speakers.length - 1}
                  onClick={() => moveRow(i, 1)}
                >
                  ↓
                </IconButton>
                <IconButton title="Remove" onClick={() => removeRow(i)} danger>
                  ×
                </IconButton>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 mb-3">
              <Field label="Name" required>
                <input
                  type="text"
                  value={s.name}
                  onChange={(e) => updateRow(i, { name: e.target.value })}
                  required
                  className={inputCls}
                />
              </Field>
              <Field label="Avatar URL">
                <input
                  type="url"
                  value={s.avatar_url ?? ""}
                  onChange={(e) => updateRow(i, { avatar_url: e.target.value || null })}
                  placeholder="https://…"
                  className={inputCls}
                />
              </Field>
            </div>

            <Field label="Bio">
              <textarea
                value={s.bio ?? ""}
                onChange={(e) => updateRow(i, { bio: e.target.value })}
                rows={2}
                className={inputCls}
              />
            </Field>
          </div>
        ))}
      </div>
    </div>
  );
}

function IconButton({
  onClick,
  children,
  title,
  disabled,
  danger,
}: {
  onClick: () => void;
  children: React.ReactNode;
  title: string;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`w-7 h-7 rounded-md border font-display font-semibold text-sm transition-colors ${
        danger
          ? "border-red-400/30 text-red-300 hover:bg-red-500/10 disabled:opacity-40"
          : "border-white/10 text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-40"
      } disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared style + utility helpers
// ─────────────────────────────────────────────────────────────

const inputCls =
  "w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white font-body placeholder:text-white/30 focus:outline-none focus:border-bsva-cyan focus:bg-white/10 transition-colors";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-body text-white/60 mb-1">
        {label} {required && <span className="text-bsva-cyan">*</span>}
      </span>
      {children}
    </label>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(local: string): string {
  return new Date(local).toISOString();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="mt-2 flex items-start gap-2 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200 font-body"
    >
      <span className="font-display font-semibold text-red-300 leading-5">!</span>
      <div className="flex-1 leading-5">{children}</div>
    </div>
  );
}
