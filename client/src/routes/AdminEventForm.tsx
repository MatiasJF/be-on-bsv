import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import type { EventInput } from "@be-on-bsv/shared";
import { api, ApiError } from "../lib/api.js";
import { GlassCard } from "../components/GlassCard.js";
import { Button } from "../components/Button.js";

interface AdminEventFormProps {
  mode: "create" | "edit";
}

/** Keep in sync with the server-side multer limit in routes/events.ts. */
const MAX_COVER_BYTES = 10 * 1024 * 1024; // 10 MB

const empty: EventInput = {
  title: "",
  description: "",
  starts_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  ends_at: null,
  location: "",
  is_virtual: true,
  cover_url: null,
  tags: [],
  host_name: "",
  host_bio: "",
  host_avatar: null,
};

export function AdminEventForm({ mode }: AdminEventFormProps) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<EventInput>(empty);
  const [tagsInput, setTagsInput] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "edit" || !id) return;
    api.events.get(id).then((r) => {
      setForm({
        title: r.event.title,
        description: r.event.description,
        starts_at: r.event.starts_at,
        ends_at: r.event.ends_at ?? null,
        location: r.event.location ?? "",
        is_virtual: r.event.is_virtual,
        cover_url: r.event.cover_url ?? null,
        tags: r.event.tags,
        host_name: r.event.host_name ?? "",
        host_bio: r.event.host_bio ?? "",
        host_avatar: r.event.host_avatar ?? null,
      });
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
    if (coverError) return; // pre-empt: don't submit if the picked file was rejected
    setBusy(true);
    setError(null);
    const payload: EventInput = {
      ...form,
      tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
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

  // Convert ISO → datetime-local format for the input
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
            <textarea
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              rows={5}
              required
              className={inputCls}
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

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Host name">
              <input
                type="text"
                value={form.host_name ?? ""}
                onChange={(e) => update("host_name", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Host avatar URL">
              <input
                type="url"
                value={form.host_avatar ?? ""}
                onChange={(e) => update("host_avatar", e.target.value || null)}
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Host bio">
            <textarea
              value={form.host_bio ?? ""}
              onChange={(e) => update("host_bio", e.target.value)}
              rows={3}
              className={inputCls}
            />
          </Field>

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
  // YYYY-MM-DDTHH:mm — strip seconds and timezone
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
