/**
 * One-shot health check for the server wallet.
 *
 * Usage:
 *   npm --workspace server run bsv:check
 *
 * Imports services/bsv.ts, calls getServerWalletInfo(), and prints the
 * resulting object as JSON. Useful for verifying that BSV_ENABLED=true,
 * the WIF parses, and the wallet-toolbox can talk to its storage backend
 * — without having to spin up the dev server and manually hit the admin API.
 *
 * Exit code 0 if `info.error` is undefined, 1 otherwise.
 */
import { getServerWalletInfo } from "../src/services/bsv.js";

async function main(): Promise<number> {
  // eslint-disable-next-line no-console
  console.log("Calling getServerWalletInfo()…");
  const info = await getServerWalletInfo();
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(info, null, 2));
  if (info.error) {
    // eslint-disable-next-line no-console
    console.error(`\n❌ wallet check failed: ${info.error}`);
    return 1;
  }
  if (!info.enabled) {
    // eslint-disable-next-line no-console
    console.error("\n⚠ BSV mode is disabled. Set BSV_ENABLED=true in .env.");
    return 1;
  }
  // eslint-disable-next-line no-console
  console.log(
    `\n✓ wallet ready — identity ${info.identityKey?.slice(0, 12)}…${info.identityKey?.slice(-6)} on ${info.network}`,
  );
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("❌ unexpected error:", err);
    process.exit(1);
  });
