/**
 * A small ink drawing of a handwritten family tree, used as the home-page
 * "photograph". Pure SVG in the brand ink colour; decorative only.
 */
export function TreeSketch() {
  const name = "font-serif italic fill-ink";
  return (
    <svg viewBox="0 0 360 240" role="img" aria-hidden className="h-auto w-full">
      <g className="stroke-ink" strokeWidth="1.25" fill="none" strokeLinecap="round" opacity="0.8">
        <path d="M152 46 H208" />
        <path d="M180 46 V86 M78 86 H282 M78 86 V112 M180 86 V112 M282 86 V112" />
        <path d="M78 146 V176 M40 176 H116 M40 176 V196 M116 176 V196" />
      </g>
      <text x="100" y="52" className={name} fontSize="21">Hasan</text>
      <text x="214" y="52" className={name} fontSize="21">Aminah</text>
      <text x="176" y="30" className="fill-ink-muted font-sans" fontSize="11" letterSpacing="1.5" textAnchor="middle">
        m. 1948
      </text>
      <text x="78" y="134" className={name} fontSize="20" textAnchor="middle">Budi</text>
      <text x="180" y="134" className={name} fontSize="20" textAnchor="middle">Sari</text>
      <text x="282" y="134" className={name} fontSize="20" textAnchor="middle">Rahmat</text>
      <text x="40" y="216" className={name} fontSize="18" textAnchor="middle">Dewi</text>
      <text x="116" y="216" className={name} fontSize="18" textAnchor="middle">Arif</text>
      <text x="282" y="154" className="fill-ink-muted font-sans" fontSize="11" letterSpacing="1" textAnchor="middle">
        † 2001
      </text>
    </svg>
  );
}
