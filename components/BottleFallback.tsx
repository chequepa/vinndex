/**
 * SVG placeholder for wines without an image URL. Much more useful than
 * an empty box: shows a stylized bottle silhouette with the brand/name
 * initials on the label, colored by a deterministic hash of the name
 * (so the same wine always gets the same color across the site).
 */
const PALETTE = [
  { bg: "#6B1E2E", accent: "#E8B547" }, // malbec + gold
  { bg: "#1E3FBF", accent: "#E8B547" }, // cobalt + gold
  { bg: "#8A4A2B", accent: "#D9C7A5" }, // terracota + cream
  { bg: "#1B7A4F", accent: "#E8B547" }, // green + gold
  { bg: "#0F1729", accent: "#B88A1B" }, // ink + bronze
  { bg: "#4A1F3A", accent: "#D6A85F" }, // plum + amber
];

function pickPalette(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) & 0xffffffff;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

function initials(s: string): string {
  const words = s
    .replace(/^(Vino|Wine)\s+/i, "")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 2);
  if (words.length === 0) return "V";
  return words.map((w) => w[0]?.toUpperCase() ?? "").join("");
}

export function BottleFallback({
  name,
  brand,
}: {
  name: string;
  brand?: string | null;
}) {
  const labelSource = (brand ?? name).trim();
  const initialsText = initials(labelSource);
  const { bg, accent } = pickPalette(labelSource);

  return (
    <div
      aria-hidden="true"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `linear-gradient(135deg, ${bg} 0%, ${bg}dd 100%)`,
      }}
    >
      <svg
        viewBox="0 0 80 120"
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "55%", height: "auto", maxHeight: "80%" }}
      >
        {/* Cap */}
        <rect x="32" y="4" width="16" height="14" rx="1.5" fill={accent} opacity="0.92" />
        {/* Neck */}
        <rect x="34" y="16" width="12" height="14" fill={accent} opacity="0.75" />
        {/* Shoulder */}
        <path
          d="M34 28 Q22 36 22 54 L22 112 Q22 118 28 118 L52 118 Q58 118 58 112 L58 54 Q58 36 46 28 Z"
          fill={accent}
          opacity="0.85"
        />
        {/* Label background */}
        <rect
          x="25"
          y="62"
          width="30"
          height="42"
          fill={bg}
          stroke={accent}
          strokeOpacity="0.35"
          strokeWidth="0.6"
          rx="1.5"
        />
        {/* Initials */}
        <text
          x="40"
          y="90"
          fill={accent}
          fontSize={initialsText.length > 1 ? "13" : "18"}
          fontWeight="800"
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
          letterSpacing="0.5"
        >
          {initialsText}
        </text>
      </svg>
    </div>
  );
}
