"use client";

import { useState } from "react";

/**
 * "¿Es el mismo vino?" — le preguntamos al usuario sobre un par candidato.
 *
 * Es el complemento activo del reporte pasivo: en vez de esperar a que
 * alguien note un error, mostramos dos fichas que el código de barras dice
 * que son el mismo vino pero el sistema separó, y preguntamos.
 *
 * Reglas de diseño:
 *   · Se muestra la ETIQUETA de los dos, porque la pregunta se contesta
 *     mirando la botella, no leyendo el nombre.
 *   · "No sé" es una respuesta de primera clase y va al mismo nivel que
 *     las otras dos. Sin esa salida, el que duda igual clickea Sí o No y
 *     nos ensucia el dato.
 *   · No se sugiere la respuesta: el veredicto de los gates no se muestra.
 *   · Una sola pregunta por ficha, y se recuerda la ya contestada para no
 *     repetirla.
 */

type Side = { slug: string; name: string; image: string };

const OPTIONS = [
  { key: "si", label: "Sí, es el mismo" },
  { key: "no", label: "No, son distintos" },
  { key: "nose", label: "No sé" },
] as const;

const STORAGE_KEY = "vinndex:pares-votados";

function alreadyVoted(pairId: string): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]).includes(pairId) : false;
  } catch {
    return false;
  }
}

function remember(pairId: string) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    if (!list.includes(pairId)) list.push(pairId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(-200)));
  } catch {
    /* sin localStorage seguimos igual */
  }
}

export function MatchQuestion({
  pairId,
  a,
  b,
}: {
  pairId: string;
  a: Side;
  b: Side;
}) {
  const [hidden] = useState(() =>
    typeof window === "undefined" ? false : alreadyVoted(pairId),
  );
  const [done, setDone] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");

  if (hidden) return null;

  async function vote(v: string) {
    setState("sending");
    try {
      const res = await fetch("/api/match-vote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pairId, vote: v, website: "" }),
      });
      if (!res.ok) {
        setState("error");
        return;
      }
      remember(pairId);
      setDone(true);
    } catch {
      setState("error");
    }
  }

  if (done) {
    return (
      <section className="mt-8 rounded-xl border border-ink/10 bg-snow px-4 py-3">
        <p className="text-sm font-medium text-ink">¡Gracias! Nos ayudaste.</p>
        <p className="text-xs text-graphite mt-1">
          Con varias respuestas podemos unificar las fichas duplicadas.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-xl border border-ink/10 bg-snow px-4 py-4">
      <h2 className="text-sm font-semibold text-ink">
        ¿Nos das una mano? ¿Estos dos son el mismo vino?
      </h2>
      <p className="text-xs text-graphite mt-1">
        Nos aparecen como dos fichas distintas y no estamos seguros.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3">
        {[a, b].map((s) => (
          <div key={s.slug} className="flex items-center gap-3 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={s.image}
              alt={s.name}
              loading="lazy"
              className="h-16 w-16 object-contain shrink-0"
            />
            <span className="text-xs text-ink min-w-0 break-words">
              {s.name}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.key}
            type="button"
            disabled={state === "sending"}
            onClick={() => void vote(o.key)}
            className="cursor-wine border border-ink/20 hover:border-cobalt hover:text-cobalt text-ink text-xs font-medium px-4 py-2 rounded-full transition-colors disabled:opacity-50"
          >
            {o.label}
          </button>
        ))}
      </div>

      {state === "error" && (
        <p className="text-xs text-malbec mt-2">
          No pudimos registrar tu respuesta, probá más tarde.
        </p>
      )}
    </section>
  );
}
