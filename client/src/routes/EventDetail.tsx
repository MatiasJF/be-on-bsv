import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import type { Event, RegistrationInput, RegistrationResponse } from "@be-on-bsv/shared";
import { api, ApiError } from "../lib/api.js";
import { GlassCard } from "../components/GlassCard.js";
import { Button } from "../components/Button.js";
import { Tag } from "../components/Tag.js";
import { formatEventDateTime, relativeWhen } from "../lib/format.js";

export function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState<Event | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.events
      .get(id)
      .then((r) => setEvent(r.event))
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : "failed_to_load"),
      );
  }, [id]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!event) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const input: RegistrationInput = {
        event_id: event.id,
        name,
        email,
        organization: organization.trim() || null,
      };
      const res: RegistrationResponse = await api.register(input);
      navigate(`/r/${res.registration.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(
          err.status === 409
            ? "You're already registered for this event."
            : err.message,
        );
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-6 pt-16">
        <GlassCard className="p-8 text-center">
          <div className="text-white/80 font-body">Event not found.</div>
        </GlassCard>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="max-w-5xl mx-auto px-6 pt-16">
        <GlassCard className="p-12 animate-pulse">
          <div className="h-8 w-2/3 bg-white/10 rounded mb-4" />
          <div className="h-4 w-1/3 bg-white/10 rounded" />
        </GlassCard>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="max-w-5xl mx-auto px-6 pt-12 pb-24"
    >
      {/* Cover */}
      <GlassCard className="overflow-hidden mb-8">
        <div className="aspect-[21/9] bg-bsva-navy/40 relative">
          {event.cover_url ? (
            <img src={event.cover_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-bsva-navy via-bsva-blue/30 to-bsva-soft" />
          )}
        </div>
      </GlassCard>

      <div className="grid lg:grid-cols-[1fr_400px] gap-8">
        <div>
          <div className="text-bsva-cyan text-sm font-body mb-2">
            {relativeWhen(event.starts_at)}
          </div>
          <h1 className="font-display font-semibold text-4xl sm:text-5xl text-white leading-tight mb-4">
            {event.title}
          </h1>
          <div className="flex flex-wrap gap-2 mb-6">
            {event.tags.map((t) => (
              <Tag key={t} label={t} />
            ))}
          </div>
          <div className="prose prose-invert max-w-none mb-8">
            <p className="text-white/80 font-body text-lg leading-relaxed whitespace-pre-line">
              {event.description}
            </p>
          </div>

          {event.host_name && (
            <GlassCard className="p-6 mb-6">
              <div className="text-xs uppercase tracking-wider text-bsva-cyan font-display font-semibold mb-3">
                Hosted by
              </div>
              <div className="flex items-start gap-4">
                {event.host_avatar && (
                  <img
                    src={event.host_avatar}
                    alt=""
                    className="w-14 h-14 rounded-full object-cover border border-white/10"
                  />
                )}
                <div>
                  <div className="font-display font-semibold text-white text-lg">
                    {event.host_name}
                  </div>
                  {event.host_bio && (
                    <div className="text-white/70 font-body text-sm mt-1">
                      {event.host_bio}
                    </div>
                  )}
                </div>
              </div>
            </GlassCard>
          )}
        </div>

        {/* Sticky registration card */}
        <aside className="lg:sticky lg:top-24 self-start">
          <GlassCard strong className="p-6">
            <div className="text-xs uppercase tracking-wider text-bsva-cyan font-display font-semibold mb-2">
              When
            </div>
            <div className="text-white font-display font-semibold text-lg mb-4">
              {formatEventDateTime(event.starts_at)}
            </div>

            <div className="text-xs uppercase tracking-wider text-bsva-cyan font-display font-semibold mb-2">
              Where
            </div>
            <div className="text-white font-body mb-6">
              {event.is_virtual ? "Online" : event.location ?? "TBA"}
            </div>

            <div className="border-t border-white/10 pt-6">
              <div className="text-white font-display font-semibold mb-4">Register</div>
              <form onSubmit={onSubmit} className="space-y-3">
                <Field
                  label="Name"
                  value={name}
                  onChange={setName}
                  required
                  autoComplete="name"
                />
                <Field
                  label="Email"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  required
                  autoComplete="email"
                />
                <Field
                  label="Organization (optional)"
                  value={organization}
                  onChange={setOrganization}
                  autoComplete="organization"
                />
                {formError && (
                  <div className="text-sm text-red-300 font-body">{formError}</div>
                )}
                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  disabled={submitting}
                >
                  {submitting ? "Minting your ticket…" : "Register"}
                </Button>
                <p className="text-xs text-white/50 font-body text-center pt-2">
                  By registering you'll get an on-chain ticket and a confirmation email.
                </p>
              </form>
            </div>
          </GlassCard>
        </aside>
      </div>
    </motion.div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  autoComplete?: string;
}

function Field({ label, value, onChange, type = "text", required, autoComplete }: FieldProps) {
  return (
    <label className="block">
      <span className="block text-xs font-body text-white/60 mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        autoComplete={autoComplete}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white font-body placeholder:text-white/30 focus:outline-none focus:border-bsva-cyan focus:bg-white/10 transition-colors"
      />
    </label>
  );
}
