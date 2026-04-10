import { format, formatDistanceToNowStrict, isPast } from "date-fns";

export function formatEventDate(iso: string): string {
  return format(new Date(iso), "EEE, d MMM yyyy");
}

export function formatEventTime(iso: string): string {
  return format(new Date(iso), "HH:mm");
}

export function formatEventDateTime(iso: string): string {
  return format(new Date(iso), "EEE, d MMM yyyy 'at' HH:mm");
}

export function relativeWhen(iso: string): string {
  const d = new Date(iso);
  const distance = formatDistanceToNowStrict(d, { addSuffix: true });
  return isPast(d) ? distance : `in ${formatDistanceToNowStrict(d)}`;
}
