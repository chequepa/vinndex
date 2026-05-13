"use client";

import { useState, useTransition } from "react";
import { submitContact, type ContactKind } from "@/app/actions/contact";

export type ContactField = {
  name: string;
  label: string;
  type?: "text" | "email" | "url" | "textarea";
  placeholder?: string;
  required?: boolean;
  helper?: string;
};

type Props = {
  kind: ContactKind;
  fields: ContactField[];
  submitLabel: string;
  successText?: string;
  variant?: "dark" | "light";
};

export function ContactForm({
  kind,
  fields,
  submitLabel,
  successText = "Te respondo cuanto antes (típicamente menos de 48hs).",
  variant = "dark",
}: Props) {
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const fieldData = Object.fromEntries(formData.entries()) as Record<
      string,
      string
    >;
    const honeypot = fieldData.website ?? "";
    delete fieldData.website;

    startTransition(async () => {
      const result = await submitContact({
        kind,
        fields: fieldData,
        honeypot,
      });
      setStatus(result.ok ? "success" : "error");
    });
  }

  const isDark = variant === "dark";
  const labelClass = isDark ? "text-snow/85" : "text-ink/80";
  const inputClass = isDark
    ? "w-full bg-snow text-ink rounded-lg px-4 py-2.5 border border-snow/20 focus:outline-none focus:ring-2 focus:ring-mustard"
    : "w-full bg-white text-ink rounded-lg px-4 py-2.5 border border-ink/15 focus:outline-none focus:ring-2 focus:ring-cobalt";
  const helperClass = isDark ? "text-snow/55" : "text-graphite";
  const buttonClass = isDark
    ? "bg-snow text-ink hover:bg-mustard"
    : "bg-cobalt text-snow hover:bg-cobalt/90";

  if (status === "success") {
    return (
      <div className={isDark ? "text-snow" : "text-ink"}>
        <p className="display text-2xl md:text-3xl font-semibold mb-2">
          ¡Listo, recibido!
        </p>
        <p className={isDark ? "text-snow/80" : "text-graphite"}>
          {successText}
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="text-left max-w-xl mx-auto space-y-4"
      noValidate={false}
    >
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-9999px",
          width: "1px",
          height: "1px",
          opacity: 0,
        }}
      />

      {fields.map((f) => (
        <div key={f.name}>
          <label
            className={`block text-sm mb-1.5 ${labelClass}`}
            htmlFor={`f-${f.name}`}
          >
            {f.label}
            {f.required && " *"}
          </label>
          {f.type === "textarea" ? (
            <textarea
              id={`f-${f.name}`}
              name={f.name}
              required={f.required}
              placeholder={f.placeholder}
              rows={4}
              maxLength={2000}
              className={inputClass}
            />
          ) : (
            <input
              id={`f-${f.name}`}
              name={f.name}
              type={f.type ?? "text"}
              required={f.required}
              placeholder={f.placeholder}
              maxLength={250}
              className={inputClass}
            />
          )}
          {f.helper && (
            <p className={`text-xs mt-1 ${helperClass}`}>{f.helper}</p>
          )}
        </div>
      ))}

      <div className="pt-2">
        <button
          type="submit"
          disabled={pending}
          className={`cursor-wine inline-flex items-center gap-2 ${buttonClass} font-semibold px-8 py-3.5 rounded-full transition-colors disabled:opacity-60 disabled:cursor-wait`}
        >
          {pending ? "Enviando..." : `${submitLabel} →`}
        </button>
      </div>

      {status === "error" && (
        <p className={isDark ? "text-mustard text-sm" : "text-malbec text-sm"}>
          Hubo un problema enviando el mensaje. Probá de nuevo en unos minutos.
        </p>
      )}
    </form>
  );
}
