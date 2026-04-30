/**
 * Tessellating triangle pattern background — references the BSVA visual
 * identity (style guide §03 — "Our triangle can tessellate and scale").
 *
 * Rendered as an SVG pattern overlay at low opacity so it adds texture
 * without overwhelming the content. Sits behind everything (z-0).
 */
export function TrianglePattern() {
  return (
    <div
      aria-hidden
      className="fixed inset-0 z-0 pointer-events-none opacity-[0.04]"
      style={{
        backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`,
        backgroundSize: "160px 138px",
      }}
    />
  );
}

// Light theme: navy strokes on the otherwise-white page, very low opacity
// so it reads as paper texture rather than decoration.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="104" viewBox="0 0 120 104">
  <g fill="none" stroke="#1B1EA9" stroke-width="1">
    <polygon points="20,90 40,55 60,90" />
    <polygon points="60,90 80,55 100,90" />
    <polygon points="40,55 60,20 80,55" />
  </g>
</svg>`;
