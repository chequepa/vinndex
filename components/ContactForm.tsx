"use client";

import { useState, type FormEvent } from "react";

type Kind = "contacto" | "sumate" | "opt-out";

const FALLBACK_EMAIL = "hola@vinndex.com.ar";

const COPY: Record<
  Kind,
  { submit: string; success: string; successSub: string }
> = {
  contacto: {
    submit: "Enviar mensaje",
    success: "¡Mensaje enviado!",
    successSub: "Te respondo a tu email, normalmente en menos de 24hs hábiles.",
  },
  sumate: {
    submit: "Sumar mi vinoteca",
    success: "¡Recibido!",
    successSub:
      "Te confirmo en ≤48hs si podemos integrarla y te aviso cuando estés en el comparador.",
  },
  "opt-out": {
    submit: "Pedir baja",
    success: "Pedido registrado",
    successSub:
      "Procesamos el opt-out en el próximo ciclo de scrape (máximo 48hs) y te confirmo por email.",
  },
};

function fieldClass() {
  return "w-full bg-snow border border-ink/15 rounded-lg px-4 py-3 text-ink outline-none focus:border-cobalt focus:ring-2 focus:ring-cobalt/20 transition";
}

export function ContactForm({ kind }: { kind: Kind }) {
  const [state, setState] = useState<
    "idle" | "submitting" | "success" | "error" | "unconfigured"
  >("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === "submitting") return;
    setState("submitting");
    setErrorMsg("");

    const fd = new FormData(e.currentTarget);
    const payload: Record<string, string> = { kind };
    fd.forEach((v, k) => {
      payload[k] = typeof v === "string" ? v : "";
    });

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setState("success");
        return;
      }
      if (res.status === 503) {
        setState("unconfigured");
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      setErrorMsg(
        data.error && data.error !== "unconfigured"
          ? data.error
          : "No pudimos enviar el mensaje. Probá de nuevo.",
      );
      setState("error");
    } catch {
      setErrorMsg("Error de red. Revisá tu conexión y probá de nuevo.");
      setState("error");
    }
  }

  if (state === "success") {
    const c = COPY[kind];
    return (
      <div className="bg-snow border border-ink/10 rounded-2xl p-8 text-center">
        <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-cobalt/10 flex items-center justify-center">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-cobalt"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h3 className="display text-2xl font-semibold text-ink mb-2">
          {c.success}
        </h3>
        <p className="text-graphite">{c.successSub}</p>
      </div>
    );
  }

  if (state === "unconfigured") {
    return (
      <div className="bg-snow border border-ink/10 rounded-2xl p-8 text-center">
        <p className="text-ink font-semibold mb-2">
          El formulario está en mantenimiento
        </p>
        <p className="text-graphite mb-5">
          Escribinos directo y lo resolvemos igual:
        </p>
        <a
          href={`mailto:${FALLBACK_EMAIL}`}
          className="cursor-wine inline-flex items-center gap-2 bg-ink text-snow font-semibold px-6 py-3 rounded-full hover:bg-cobalt transition-colors"
        >
          {FALLBACK_EMAIL}
        </a>
      </div>
    );
  }

  const submitting = state === "submitting";

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {/* Honeypot — invisible para humanos, los bots lo completan. */}
      <div aria-hidden="true" className="hidden">
        <label>
          No completar este campo
          <input
            type="text"
            name="_gotcha"
            tabIndex={-1}
            autoComplete="off"
          />
        </label>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="cf-nombre"
            className="block text-sm font-medium text-ink mb-1.5"
          >
            Nombre
          </label>
          <input
            id="cf-nombre"
            name="nombre"
            type="text"
            required
            autoComplete="name"
            className={fieldClass()}
          />
        </div>
        <div>
          <label
            htmlFor="cf-email"
            className="block text-sm font-medium text-ink mb-1.5"
          >
            Email
          </label>
          <input
            id="cf-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className={fieldClass()}
          />
        </div>
      </div>

      {kind === "sumate" && (
        <>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="cf-vinoteca"
                className="block text-sm font-medium text-ink mb-1.5"
              >
                Nombre de la vinoteca
              </label>
              <input
                id="cf-vinoteca"
                name="vinoteca"
                type="text"
                required
                className={fieldClass()}
              />
            </div>
            <div>
              <label
                htmlFor="cf-plataforma"
                className="block text-sm font-medium text-ink mb-1.5"
              >
                Plataforma
              </label>
              <select
                id="cf-plataforma"
                name="plataforma"
                defaultValue=""
                className={fieldClass()}
              >
                <option value="">No sé / otra</option>
                <option value="Tiendanube">Tiendanube</option>
                <option value="WooCommerce">WooCommerce</option>
                <option value="Shopify">Shopify</option>
                <option value="VTEX">VTEX</option>
                <option value="Magento">Magento</option>
                <option value="PrestaShop">PrestaShop</option>
              </select>
            </div>
          </div>
          <div>
            <label
              htmlFor="cf-url"
              className="block text-sm font-medium text-ink mb-1.5"
            >
              URL de la tienda
            </label>
            <input
              id="cf-url"
              name="url"
              type="url"
              required
              placeholder="https://"
              className={fieldClass()}
            />
          </div>
        </>
      )}

      {kind === "opt-out" && (
        <div>
          <label
            htmlFor="cf-url"
            className="block text-sm font-medium text-ink mb-1.5"
          >
            Vinoteca o URL a dar de baja
          </label>
          <input
            id="cf-url"
            name="url"
            type="text"
            required
            placeholder="Nombre o https://…"
            className={fieldClass()}
          />
        </div>
      )}

      <div>
        <label
          htmlFor="cf-mensaje"
          className="block text-sm font-medium text-ink mb-1.5"
        >
          {kind === "opt-out"
            ? "Motivo (opcional)"
            : kind === "sumate"
              ? "Mensaje (opcional)"
              : "Mensaje"}
        </label>
        <textarea
          id="cf-mensaje"
          name="mensaje"
          rows={kind === "contacto" ? 5 : 3}
          required={kind === "contacto"}
          className={`${fieldClass()} resize-y`}
        />
      </div>

      {state === "error" && (
        <p className="text-sm text-terracota bg-terracota/10 border border-terracota/20 rounded-lg px-4 py-3">
          {errorMsg}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="cursor-wine inline-flex items-center gap-2 bg-cobalt text-snow font-semibold px-7 py-3 rounded-full hover:bg-ink transition-colors disabled:opacity-60 disabled:cursor-wait"
      >
        {submitting ? "Enviando…" : COPY[kind].submit}
      </button>
    </form>
  );
}
