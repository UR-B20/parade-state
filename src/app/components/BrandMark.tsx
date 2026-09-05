/** Two cobalt strokes: a restrained mark that reads as a rank chevron and a rising line. */
export function BrandMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
      <path d="M3 13.5 10 6.5l7 7" stroke="var(--primary)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 17h8" stroke="var(--primary)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
