/**
 * Build a WhatsOnChain transaction URL for a real txid.
 *
 * Returns `null` for stub txids (which never touch the chain) and for empty
 * inputs, so callers can use `??` to fall back to a confirmation-page link.
 *
 * Mainnet: https://whatsonchain.com/tx/<txid>
 * Testnet: https://test.whatsonchain.com/tx/<txid>
 */
export function whatsOnChainTxUrl(
  txid: string | null | undefined,
  network: "main" | "test" = "main",
): string | null {
  if (!txid || txid.startsWith("stub-")) return null;
  const host = network === "test" ? "test.whatsonchain.com" : "whatsonchain.com";
  return `https://${host}/tx/${txid}`;
}
