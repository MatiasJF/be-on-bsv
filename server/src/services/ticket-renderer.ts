import QRCode from "qrcode";
import {
  BE_ON_BSV_TICKET_TEMPLATE,
  TICKET_PLACEHOLDER_RE,
  type TicketTemplate,
  type TicketTemplateData,
} from "./ticket-template.js";

/** XML-escape a value before injecting into the SVG. Lifted from APH's `template.ts`. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Render the QR portion as inline SVG paths so the final ticket is a single
 * self-contained SVG file (no nested base64 images, smaller on-chain footprint).
 *
 * `qrcode`'s SVG output wraps the modules in a `<path>` inside an outer `<svg>`.
 * We strip the outer wrapper and return only the inner contents — the parent
 * template positions and scales them.
 */
async function renderQrInnerSvg(payload: string): Promise<string> {
  const fullSvg = await QRCode.toString(payload, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 0,
    color: { dark: "#1B1EA9", light: "#FFFFFF00" },
  });
  const open = fullSvg.indexOf(">", fullSvg.indexOf("<svg")) + 1;
  const close = fullSvg.lastIndexOf("</svg>");
  return fullSvg.slice(open, close).trim();
}

export interface RenderTicketInput {
  eventTitle: string;
  name: string;
  date: string;
  where: string;
  registrationId: string;
  eventId: string;
  issuedAt: string;
  /** What the QR code resolves to. Typically the WhatsOnChain or 1sat-ord viewer URL. */
  qrPayload: string;
}

/**
 * Render the BE-on-BSV ticket SVG for a registration. Returns the full SVG
 * string ready to be sent over HTTP or inscribed on chain.
 */
export async function renderTicketSvg(input: RenderTicketInput): Promise<string> {
  const qrPath = await renderQrInnerSvg(input.qrPayload);
  const data: TicketTemplateData = {
    eventTitle: input.eventTitle,
    name: input.name,
    date: input.date,
    where: input.where,
    registrationId: input.registrationId,
    eventId: input.eventId,
    issuedAt: input.issuedAt,
    qrPath,
  };
  return fillTemplate(BE_ON_BSV_TICKET_TEMPLATE, data);
}

function fillTemplate(template: TicketTemplate, data: TicketTemplateData): string {
  return template.svg.replace(TICKET_PLACEHOLDER_RE, (_match, key: string) => {
    const value = (data as unknown as Record<string, string>)[key];
    if (value === undefined) {
      throw new Error(`Missing template value for placeholder {{${key}}}`);
    }
    // qrPath is already inline SVG markup — must NOT be XML-escaped, otherwise
    // the QR renders as literal text. All other placeholders are user data.
    if (key === "qrPath") return value;
    return escapeXml(value);
  });
}

/** UTF-8 encode the SVG so it can be inscribed as `image/svg+xml` bytes. */
export function svgToBytes(svg: string): Uint8Array {
  return new TextEncoder().encode(svg);
}
