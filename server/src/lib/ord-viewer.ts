/**
 * Build the public viewer URL for a 1sat-ord outpoint.
 *
 * Returns `null` for stub outpoints and missing inputs so callers can use `??`
 * to fall back to the WhatsOnChain link or the local confirmation page.
 *
 * `gorillapool` exposes the inscription content directly at `/content/<outpoint>`
 * with the original content-type, so the SVG renders inline. This is the right
 * surface for "view the ticket" — viewers like 1satordinals.com tend to wrap
 * the content in an outer chrome that hides the SVG.
 *
 * Outpoint format: gorillapool / 1satordinals / junglebus indexers use
 * `<txid>_<vout>` (underscore). The wallet-toolbox internally uses
 * `<txid>.<vout>` (dot) for token outpoints, so we normalize at URL build
 * time. The DB column keeps the dot format for consistency with PushDrop.
 *
 * Mainnet uses the gorillapool junglebus host. Testnet ord viewers are scarce;
 * we fall back to WhatsOnChain (handled by the caller).
 */
function toOrdSlug(outpoint: string): string {
  return outpoint.replace(".", "_");
}

export function ordContentUrl(
  outpoint: string | null | undefined,
  network: "main" | "test" = "main",
): string | null {
  if (!outpoint || outpoint.startsWith("stub-")) return null;
  if (network === "test") return null;
  return `https://ordinals.gorillapool.io/content/${toOrdSlug(outpoint)}`;
}

/** Inscription gallery / metadata page (vs the raw content URL above). */
export function ordGalleryUrl(
  outpoint: string | null | undefined,
  network: "main" | "test" = "main",
): string | null {
  if (!outpoint || outpoint.startsWith("stub-")) return null;
  if (network === "test") return null;
  return `https://1satordinals.com/outpoint/${toOrdSlug(outpoint)}`;
}
