/**
 * SVG template for the BE-on-BSV ticket ordinal.
 *
 * Design intent
 * -------------
 *  - Inscribed on-chain as the 1sat ordinal's content (image/svg+xml), so it
 *    must render in any SVG-aware viewer with no external assets. No webfonts,
 *    no remote images, no scripts. Falls back to system sans-serif.
 *  - Mirrors BSVA brand tokens (Navy / Blue / Cyan / Soft Black). The triangle
 *    apex in the corner is the brand's recurring motif (style guide §03).
 *  - Placeholder substitution follows the APH certificate-poc convention:
 *    `{{key}}` tokens are replaced via regex with XML-escaped values.
 *  - The QR slot (`{{qrPath}}`) is filled with the inner `<path>` chunks of
 *    a qrcode-generated SVG so the result stays a single self-contained SVG.
 */

export interface TicketTemplate {
  id: string;
  width: number;
  height: number;
  svg: string;
}

const TICKET_WIDTH = 1200;
const TICKET_HEIGHT = 750;

/**
 * The placeholder layout. Keys must match TicketTemplateData.
 *
 * Whitespace inside the SVG is preserved verbatim — ordinals are billed by the
 * byte, so the template is intentionally compact (no indentation between
 * elements once it ships). Indentation here is for legibility during edits.
 */
export const BE_ON_BSV_TICKET_TEMPLATE: TicketTemplate = {
  id: "be-on-bsv-ticket/v1",
  width: TICKET_WIDTH,
  height: TICKET_HEIGHT,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TICKET_WIDTH} ${TICKET_HEIGHT}" width="${TICKET_WIDTH}" height="${TICKET_HEIGHT}" font-family="Helvetica, Arial, sans-serif">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#1B1EA9"/>
<stop offset="1" stop-color="#2D2D31"/>
</linearGradient>
</defs>
<rect width="${TICKET_WIDTH}" height="${TICKET_HEIGHT}" fill="url(#bg)"/>
<polygon points="${TICKET_WIDTH},0 ${TICKET_WIDTH},220 ${TICKET_WIDTH - 220},0" fill="#003FFF" opacity="0.55"/>
<polygon points="${TICKET_WIDTH},0 ${TICKET_WIDTH},120 ${TICKET_WIDTH - 120},0" fill="#00E6FF"/>
<g transform="translate(64,64)">
<text font-size="14" letter-spacing="3" fill="#00E6FF" font-weight="700">BE ON BSV — TICKET</text>
<text y="34" font-size="13" fill="#FFFFFF" opacity="0.65">Inscribed on the BSV Blockchain</text>
</g>
<g transform="translate(64,200)">
<text font-size="22" fill="#FFFFFF" opacity="0.7" font-weight="600">{{eventTitle}}</text>
<text y="90" font-size="76" fill="#FFFFFF" font-weight="700">{{name}}</text>
</g>
<g transform="translate(64,440)">
<text font-size="13" letter-spacing="2" fill="#00E6FF" font-weight="700">WHEN</text>
<text y="32" font-size="22" fill="#FFFFFF">{{date}}</text>
</g>
<g transform="translate(64,540)">
<text font-size="13" letter-spacing="2" fill="#00E6FF" font-weight="700">WHERE</text>
<text y="32" font-size="22" fill="#FFFFFF">{{where}}</text>
</g>
<g transform="translate(64,${TICKET_HEIGHT - 96})">
<text font-size="11" letter-spacing="2" fill="#FFFFFF" opacity="0.5" font-weight="700">REGISTRATION</text>
<text y="22" font-size="13" fill="#FFFFFF" opacity="0.7" font-family="ui-monospace, Menlo, Consolas, monospace">{{registrationId}}</text>
<text y="44" font-size="11" letter-spacing="2" fill="#FFFFFF" opacity="0.5" font-weight="700">EVENT</text>
<text y="64" font-size="13" fill="#FFFFFF" opacity="0.7" font-family="ui-monospace, Menlo, Consolas, monospace">{{eventId}}</text>
</g>
<g transform="translate(${TICKET_WIDTH - 320},${TICKET_HEIGHT - 320})">
<rect x="-16" y="-16" width="288" height="288" fill="#FFFFFF" rx="12"/>
<g transform="translate(0,0) scale(${256 / 33})">{{qrPath}}</g>
</g>
<g transform="translate(${TICKET_WIDTH - 64},80)" text-anchor="end">
<text font-size="13" letter-spacing="2" fill="#FFFFFF" opacity="0.5" font-weight="700">ISSUED</text>
<text y="22" font-size="13" fill="#FFFFFF" opacity="0.8">{{issuedAt}}</text>
</g>
</svg>`,
};

export const TICKET_PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

/** Required values for filling the template. */
export interface TicketTemplateData {
  eventTitle: string;
  name: string;
  date: string;
  where: string;
  registrationId: string;
  eventId: string;
  issuedAt: string;
  /** Inner contents of a qrcode-generated SVG (the `<path>` chunks). */
  qrPath: string;
}
