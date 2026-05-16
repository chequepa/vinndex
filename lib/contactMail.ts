/**
 * Envío de mails de los forms del sitio (contacto / sumate / opt-out) vía
 * Resend REST API.
 *
 * Usamos fetch directo a `https://api.resend.com/emails` en lugar del SDK
 * para no sumar una dependencia por una sola llamada.
 *
 * Env vars:
 *   - RESEND_API_KEY      — sin esto el form queda deshabilitado (la UI
 *                            cae al fallback `mailto:`). Preferimos romper
 *                            visible a tragarnos mensajes en silencio.
 *   - CONTACT_TO_EMAIL    — destino. Default: hola@vinndex.com.ar
 *   - CONTACT_FROM_EMAIL  — remitente. Default: "Vinndex
 *                            <hola@vinndex.com.ar>". OJO: el dominio tiene
 *                            que estar verificado en Resend o la API
 *                            rechaza el envío.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_TO = "hola@vinndex.com.ar";
const DEFAULT_FROM = "Vinndex <hola@vinndex.com.ar>";

export type SendResult =
  | { ok: true }
  | { ok: false; reason: "unconfigured" | "send-failed"; detail?: string };

interface SendArgs {
  subject: string;
  /** Texto plano del cuerpo (sin HTML — lo escapamos a <p> nosotros). */
  bodyLines: string[];
  /** Email de quien completó el form, para poder responderle directo. */
  replyTo: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendContactMail(args: SendArgs): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.length < 8) {
    return { ok: false, reason: "unconfigured" };
  }

  const to = process.env.CONTACT_TO_EMAIL || DEFAULT_TO;
  const from = process.env.CONTACT_FROM_EMAIL || DEFAULT_FROM;

  const text = args.bodyLines.join("\n");
  const html = args.bodyLines
    .map((l) => (l.trim() === "" ? "<br/>" : `<p>${escapeHtml(l)}</p>`))
    .join("\n");

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // Resend devuelve 403 code 1010 si no mandás User-Agent.
        "User-Agent": "vinndex-contact/1.0",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: args.subject,
        text,
        html,
        reply_to: args.replyTo,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        ok: false,
        reason: "send-failed",
        detail: `HTTP ${res.status}: ${detail.slice(0, 200)}`,
      };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      reason: "send-failed",
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}
