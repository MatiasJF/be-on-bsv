import QRCode from "qrcode";

/**
 * Render a QR code as a PNG data URL (suitable for embedding in HTML email).
 */
export async function renderQrPngDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 360,
    color: {
      dark: "#1B1EA9", // BSVA Navy
      light: "#FFFFFF",
    },
  });
}
