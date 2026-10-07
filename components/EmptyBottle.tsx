/**
 * Ilustración del 404: una botella vacía tumbada sobre la mesa, de noche,
 * con la etiqueta "Reserva 404". La botella se mece y cae la última gota
 * (`.bottle-rock` / `.last-drop` en globals.css, apagadas con
 * prefers-reduced-motion). Mismo lenguaje que la botella del hero: vidrio
 * con refracción, etiqueta cream con bandas malbec, Fraunces.
 */
export function EmptyBottle({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 360 250"
      className={className}
      role="img"
      aria-label="Ilustración: una botella de vino vacía, tumbada, con una etiqueta que dice Reserva 404"
    >
      <defs>
        <linearGradient id="eb-glass" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#F5EDE0" stopOpacity="0.32" />
          <stop offset="0.5" stopColor="#F5EDE0" stopOpacity="0.12" />
          <stop offset="1" stopColor="#F5EDE0" stopOpacity="0.22" />
        </linearGradient>
        <linearGradient id="eb-label" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#FAF4E8" />
          <stop offset="1" stopColor="#EBDFC4" />
        </linearGradient>
      </defs>

      {/* Luna + estrellas */}
      <circle cx="300" cy="44" r="30" fill="#E8B547" opacity="0.18" />
      <circle cx="300" cy="44" r="17" fill="#E8B547" />
      <circle cx="294" cy="40" r="3" fill="#D97449" opacity="0.45" />
      <circle cx="305" cy="50" r="2" fill="#D97449" opacity="0.45" />
      <g fill="#F5EDE0" opacity="0.8">
        <circle cx="48" cy="34" r="1.6" />
        <circle cx="132" cy="18" r="1.2" />
        <circle cx="214" cy="52" r="1.4" />
        <circle cx="250" cy="20" r="1" />
      </g>

      {/* Montañas al fondo */}
      <path
        d="M0 176 L50 140 L92 160 L150 118 L204 150 L258 124 L316 156 L360 138 L360 206 L0 206 Z"
        fill="#0F1E4D"
        opacity="0.55"
      />

      {/* Mesa */}
      <rect x="0" y="206" width="360" height="44" fill="#0F1E4D" />
      <line x1="0" y1="206" x2="360" y2="206" stroke="#F5EDE0" strokeOpacity="0.25" />

      {/* Charquito de la gota */}
      <ellipse cx="314" cy="209" rx="12" ry="2.6" fill="#6B1E2E" />

      <g className="bottle-rock">
        {/* Sombra */}
        <ellipse cx="172" cy="208" rx="128" ry="5" fill="#000" opacity="0.25" />
        {/* Cuerpo + hombro + cuello, de costado */}
        <path
          d="M 62 134
             Q 40 134 40 156
             L 40 184
             Q 40 206 62 206
             L 222 206
             C 240 206 248 192 262 186
             L 300 182
             L 306 182
             L 306 158
             L 300 158
             L 262 154
             C 248 148 240 134 222 134
             Z"
          fill="url(#eb-glass)"
          stroke="#F5EDE0"
          strokeOpacity="0.8"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        {/* Lo que quedó: un hilo de vino en el fondo */}
        <path
          d="M 48 198 Q 52 203 62 203 L 222 203 C 232 203 238 200 244 197 L 48 197 Z"
          fill="#6B1E2E"
        />
        {/* Refracción */}
        <path
          d="M 64 142 L 214 142"
          stroke="#F5EDE0"
          strokeOpacity="0.5"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        {/* Etiqueta */}
        <rect x="88" y="140" width="112" height="60" rx="2" fill="url(#eb-label)" />
        <rect x="88" y="140" width="112" height="2.5" fill="#6B1E2E" />
        <rect x="88" y="197.5" width="112" height="2.5" fill="#6B1E2E" />
        <text
          x="144"
          y="154"
          textAnchor="middle"
          fontSize="7"
          fontWeight="700"
          letterSpacing="2"
          fill="#0F1729"
          style={{ fontFamily: "var(--font-display)" }}
        >
          VINNDEX · RESERVA
        </text>
        <text
          x="144"
          y="182"
          textAnchor="middle"
          fontSize="28"
          fontWeight="700"
          fill="#6B1E2E"
          style={{ fontFamily: "var(--font-display)" }}
        >
          404
        </text>
        <text
          x="144"
          y="193"
          textAnchor="middle"
          fontSize="5.6"
          letterSpacing="1.6"
          fontWeight="600"
          fill="#0F1729"
          opacity="0.75"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          PÁGINA NO ENCONTRADA
        </text>
      </g>

      {/* La última gota */}
      <path
        className="last-drop"
        d="M 312 176 C 308 182 308 186 312 187 C 316 186 316 182 312 176 Z"
        fill="#6B1E2E"
      />
    </svg>
  );
}
