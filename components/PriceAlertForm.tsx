"use client";

/**
 * "Avisame si baja" — alerta de precio por mail desde la ficha.
 *
 * Plegado por default (un botón al lado de Compartir): la ficha es para
 * decidir dónde comprar hoy, y la alerta es para el que todavía no compra.
 * Precio objetivo opcional; sin objetivo avisamos ante una baja ≥ 5%.
 * El mail se recuerda en localStorage para no pedirlo en cada ficha.
 * Backend y doble opt-in: lib/alerts.ts.
 */

import { useState } from "react";
import { formatArs } from "@/lib/snapshot";

type Props = {
  slug: string;
  currentPrice: number | null;
};

type State =
  | { kind: "closed" }
  | { kind: "open" }
  | { kind: "sending" }
  | { kind: "done"; status: "pending" | "active" | "updated" }
  | { kind: "error"; message: string };

const EMAIL_KEY = "vx:alert-email";

function readEmail(): string {
  try {
    return localStorage.getItem(EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

export function PriceAlertForm({ slug, currentPrice }: Props) {
  const [state, setState] = useState<State>({ kind: "closed" });
  const [email, setEmail] = useState("");
  const suggested = currentPrice ? Math.round((currentPrice * 0.9) / 100) * 100 : null;
  const [target, setTarget] = useState<string>("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/alertas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          slug,
          target: target.replace(/[^\d]/g, "") || null,
          _gotcha: form.get("_gotcha") ?? "",
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        status?: "pending" | "active" | "updated";
        error?: string;
      };
      if (!res.ok || !j.status) {
        setState({ kind: "error", message: j.error ?? "No pudimos guardar la alerta." });
        return;
      }
      try {
        localStorage.setItem(EMAIL_KEY, email.trim());
      } catch {
        /* sin storage: no pasa nada */
      }
      setState({ kind: "done", status: j.status });
    } catch {
      setState({ kind: "error", message: "Sin conexión. Probá de nuevo." });
    }
  }

  if (state.kind === "closed") {
    return (
      <button
        type="button"
        onClick={() => {
          setEmail((prev) => prev || readEmail());
          setState({ kind: "open" });
        }}
        className="cursor-wine inline-flex items-center gap-2 min-h-11 px-4 rounded-full border border-snow/35 text-snow text-sm font-medium hover:bg-snow/15 transition-colors"
      >
        <BellIcon />
        Avisame si baja
      </button>
    );
  }

  if (state.kind === "done") {
    const msg =
      state.status === "pending"
        ? "Te mandamos un mail para confirmar. Con un click queda activa."
        : state.status === "updated"
          ? "Ya tenías una alerta para este vino: la actualizamos."
          : "Listo, alerta activa. Te escribimos cuando baje.";
    return (
      <p role="status" className="rounded-2xl bg-snow/10 border border-snow/25 px-4 py-3 text-sm text-snow max-w-md">
        <BellIcon /> {msg}
      </p>
    );
  }

  const sending = state.kind === "sending";
  return (
    <form
      onSubmit={submit}
      className="rounded-2xl bg-snow/10 border border-snow/25 p-4 text-snow max-w-md space-y-3"
    >
      <p className="text-sm font-semibold flex items-center gap-2">
        <BellIcon /> Te avisamos por mail cuando baje
      </p>
      <label className="block">
        <span className="block text-xs text-snow/75 mb-1">Tu mail</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full min-h-11 rounded-xl bg-white text-ink px-3 text-base"
          placeholder="vos@mail.com"
        />
      </label>
      <label className="block">
        <span className="block text-xs text-snow/75 mb-1">
          Avisame si llega a… <span className="text-snow/60">(opcional{currentPrice ? `, hoy está ${formatArs(currentPrice)}` : ""})</span>
        </span>
        <input
          inputMode="numeric"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="w-full min-h-11 rounded-xl bg-white text-ink px-3 text-base tabular-nums"
          placeholder={suggested ? `ej. ${formatArs(suggested)}` : "precio en pesos"}
        />
        <span className="block text-[11px] text-snow/60 mt-1">
          Si lo dejás vacío, te avisamos ante cualquier baja de 5% o más.
        </span>
      </label>
      {/* Honeypot */}
      <input type="text" name="_gotcha" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      {state.kind === "error" && (
        <p role="alert" className="text-sm text-mustard">
          {state.message}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={sending}
          className="cursor-wine inline-flex items-center min-h-11 px-5 rounded-full bg-[#f5ede0] text-[#6b1e2e] text-sm font-semibold hover:bg-mustard disabled:opacity-60"
        >
          {sending ? "Guardando…" : "Crear alerta"}
        </button>
        <button
          type="button"
          onClick={() => setState({ kind: "closed" })}
          className="text-sm text-snow/75 hover:text-snow underline"
        >
          Cancelar
        </button>
      </div>
      <p className="text-[11px] text-snow/60 leading-snug">
        Sólo usamos tu mail para este aviso. Cada mail trae la baja en un click.
      </p>
    </form>
  );
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="inline-block shrink-0">
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
