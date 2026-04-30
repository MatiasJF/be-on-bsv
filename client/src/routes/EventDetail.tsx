import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import type {
  Event,
  EventSpeaker,
  RegistrationInput,
  RegistrationResponse,
} from "@be-on-bsv/shared";
import { api, ApiError } from "../lib/api.js";
import { GlassCard } from "../components/GlassCard.js";
import { Button } from "../components/Button.js";
import { Tag } from "../components/Tag.js";
import { RichTextRender } from "../components/RichTextRender.js";
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
          <div className="text-bsva-soft/80 font-body">Event not found.</div>
        </GlassCard>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="max-w-5xl mx-auto px-6 pt-16">
        <GlassCard className="p-12 animate-pulse">
          <div className="h-8 w-2/3 bg-bsva-grey rounded mb-4" />
          <div className="h-4 w-1/3 bg-bsva-grey rounded" />
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
          <div className="text-bsva-blue text-sm font-body mb-2">
            {relativeWhen(event.starts_at)}
          </div>
          <h1 className="font-display font-semibold text-4xl sm:text-5xl text-bsva-navy leading-tight mb-4">
            {event.title}
          </h1>
          <div className="flex flex-wrap gap-2 mb-6">
            {event.tags.map((t) => (
              <Tag key={t} label={t} />
            ))}
          </div>
          <div className="mb-8">
            <RichTextRender html={event.description} />
          </div>

          {event.speakers.length > 0 && (
            <GlassCard className="p-6 mb-6">
              <div className="text-xs uppercase tracking-wider text-bsva-blue font-display font-semibold mb-4">
                {speakersHeading(event.speakers)}
              </div>
              <ul className="space-y-5">
                {event.speakers.map((s, i) => (
                  <li key={s.id ?? `${s.name}-${i}`} className="flex items-start gap-4">
                    {s.avatar_url ? (
                      <img
                        src={s.avatar_url}
                        alt=""
                        className="w-14 h-14 rounded-full object-cover border border-bsva-grey flex-none"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-bsva-blue/20 border border-bsva-grey flex-none flex items-center justify-center font-display font-semibold text-bsva-blue">
                        {s.name.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-display font-semibold text-bsva-navy text-lg leading-tight">
                        {s.name}
                      </div>
                      {s.role && s.role !== "speaker" && (
                        <div className="text-bsva-blue text-xs font-display font-semibold uppercase tracking-wider mt-0.5">
                          {s.role}
                        </div>
                      )}
                      {s.bio && (
                        <div className="text-bsva-soft/70 font-body text-sm mt-1.5 leading-relaxed">
                          {s.bio}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </GlassCard>
          )}
        </div>

        {/* Sticky registration card */}
        <aside className="lg:sticky lg:top-24 self-start">
          <GlassCard strong className="p-6">
            <div className="text-xs uppercase tracking-wider text-bsva-blue font-display font-semibold mb-2">
              When
            </div>
            <div className="text-bsva-navy font-display font-semibold text-lg mb-4">
              {formatEventDateTime(event.starts_at)}
            </div>

            <div className="text-xs uppercase tracking-wider text-bsva-blue font-display font-semibold mb-2">
              Where
            </div>
            <div className="text-bsva-navy font-body mb-6">
              {event.is_virtual ? "Online" : event.location ?? "TBA"}
            </div>

            <div className="border-t border-white/10 pt-6">
              {isPast(event) ? (
                <div className="text-center">
                  <div className="text-white/70 font-body text-sm">
                    This session has already happened. Catch the recap on the
                    homepage or browse upcoming sessions.
                  </div>
                </div>
              ) : (
                <>
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
                </>
              )}
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

function isPast(event: Event): boolean {
  // Use ends_at if set, else starts_at as the cutoff. Events in the past
  // can't accept new registrations from the UI; the server enforces this
  // too via /api/register so the gate isn't UI-only.
  const cutoff = event.ends_at ?? event.starts_at;
  return new Date(cutoff) < new Date();
}

function speakersHeading(list: EventSpeaker[]): string {
  // "Hosted by" when there's exactly one host, otherwise "Speakers".
  if (list.length === 1 && list[0]!.role === "host") return "Hosted by";
  const allHost = list.every((s) => s.role === "host");
  if (allHost) return "Hosted by";
  return "Speakers";
}

function Field({ label, value, onChange, type = "text", required, autoComplete }: FieldProps) {
  return (
    <label className="block">
      <span className="block text-xs font-body text-bsva-soft/60 mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        autoComplete={autoComplete}
        className="w-full bg-bsva-grey/40 border border-bsva-grey rounded-lg px-3 py-2.5 text-bsva-navy font-body placeholder:text-bsva-soft/30 focus:outline-none focus:border-bsva-blue focus:bg-white transition-colors"
      />
    </label>
  );
}
