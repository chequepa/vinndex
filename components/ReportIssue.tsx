"use client";

import { useState } from "react";

/**
 * Reporte de usuario sobre una ficha.
 *
 * Diseño: la barrera tiene que ser CERO. Sin email, sin captcha, sin
 * modal. Un renglón discreto debajo de la tabla de ofertas — que es
 * donde aparece la duda — con tres chips. Tocar un chip ya es el
 * reporte; el detalle es opcional y se pide después de mandarlo, así
 * que nadie se queda a mitad de camino.
 *
 * Las tres razones son los tres modos de falla que pelea el pipeline
 * (quimera / falso split / precio mal parseado), no categorías
 * genéricas: así cada reporte cae en algo accionable.
 */

const CHIPS = [
  { key: "mezclados", label: "Hay vinos mezclados" },
  { key: "duplicada", label: "Está duplicada" },
  { key: "precio", label: "El precio no coincide" },
] as const;

type ChipKey = (typeof CHIPS)[number]["key"];

export function ReportIssue({
  slug,
  wineName,
}: {
  slug: string;
  wineName: string;
}) {
  const [sent, setSent] = useState<ChipKey | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "error" | "off">(
    "idle",
  );
  const [detail, setDetail] = useState("");
  const [detailDone, setDetailDone] = useState(false);

  async function send(reason: ChipKey, extra?: string) {
    setState("sending");
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug,
          wineName,
          reason,
          detail: extra ?? "",
          website: "",
        }),
      });
      if (res.status === 503) {
        setState("off");
        return;
      }
      if (!res.ok) {
        setState("error");
        return;
      }
      setState("idle");
      setSent(reason);
    } catch {
      setState("error");
    }
  }

  if (state === "off") return null;

  if (sent) {
    return (
      <div className="mt-4 text-xs text-graphite">
        <p className="font-medium text-ink">Gracias, lo anotamos.</p>
        {!detailDone ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label htmlFor="report-detail" className="sr-only">
              Contanos un poco más (opcional)
            </label>
            <input
              id="report-detail"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              maxLength={280}
              placeholder="¿Querés contarnos algo más? (opcional)"
              className="flex-1 min-w-[220px] bg-snow border border-ink/15 rounded-lg px-3 py-2 text-ink outline-none focus:border-cobalt focus:ring-2 focus:ring-cobalt/20 transition"
            />
            <button
              type="button"
              onClick={() => {
                const t = detail.trim();
                if (t) void send(sent, t);
                setDetailDone(true);
              }}
              className="cursor-wine border border-ink/20 hover:border-cobalt hover:text-cobalt text-ink font-medium px-4 py-2 rounded-full transition-colors"
            >
              Enviar
            </button>
          </div>
        ) : (
          <p className="mt-1">Con esto mejoramos el matching. Gracias.</p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
      <span className="text-graphite">¿Ves algo mal en esta ficha?</span>
      {CHIPS.map((c) => (
        <button
          key={c.key}
          type="button"
          disabled={state === "sending"}
          onClick={() => void send(c.key)}
          className="cursor-wine border border-ink/15 hover:border-cobalt hover:text-cobalt text-graphite px-3 py-1 rounded-full transition-colors disabled:opacity-50"
        >
          {c.label}
        </button>
      ))}
      {state === "error" && (
        <span className="text-malbec">No pudimos registrarlo, probá luego.</span>
      )}
    </div>
  );
}
