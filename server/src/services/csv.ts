import { stringify } from "csv-stringify";
import type { Response } from "express";

export interface RegistrationCsvRow {
  Name: string;
  Email: string;
  Organization: string;
  Timestamp: string;
  "Event Name": string;
  TxID: string;
}

/**
 * Stream a CSV of registration rows to an Express response.
 *
 * Streamed (not buffered) so an event with thousands of registrants doesn't
 * blow up server memory.
 */
export function streamRegistrationsCsv(
  res: Response,
  rows: Iterable<RegistrationCsvRow>,
  filename: string,
): void {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const stringifier = stringify({
    header: true,
    columns: ["Name", "Email", "Organization", "Timestamp", "Event Name", "TxID"],
  });

  stringifier.pipe(res);
  for (const row of rows) {
    stringifier.write(row);
  }
  stringifier.end();
}
