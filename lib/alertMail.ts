/**
 * Mails transaccionales de las alertas de precio (confirmación). Los
 * avisos de baja los manda scripts/notify-price-alerts.mjs con la misma
 * API y el mismo remitente.
 *
 * Env: RESEND_API_KEY (obligatoria), ALERTS_FROM_EMAIL (default: el
 * remitente de contacto). El dominio tiene que estar verificado en Resend.
 */
import { formatArs } from "./snapshot";
import { confirmUrl, siteUrl, type AlertRecord } from "./alerts";

const RESEND_ENDPOINT = process.env.RESEND_API_URL ?? "https://api.resend.com/emails";

function fromAddress(): string {
  return (
    process.env.ALERTS_FROM_EMAIL ||
    process.env.CONTACT_FROM_EMAIL ||
    "Vinndex <hola@vinndex.com.ar>"
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendConfirmationMail(alert: AlertRecord): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  const link = confirmUrl(alert.id);
  const wine = alert.wineName;
  const cond =
    alert.target != null
      ? `cuando baje a ${formatArs(alert.target)} o menos`
      : "cuando baje de precio";
  const text = [
    `Hola,`,
    ``,
    `Pediste que te avisemos ${cond}: ${wine}.`,
    ``,
    `Confirmá tu mail con este link y la alerta queda activa:`,
    link,
    ``,
    `Si no fuiste vos, ignorá este mail: sin confirmar, la alerta se borra sola en 7 días.`,
    ``,
    `Vinndex · ${siteUrl()}`,
  ].join("\n");
  const html = `
<div style="font-family:Inter,Arial,sans-serif;color:#0f1729;max-width:520px;margin:0 auto;padding:24px">
  <p style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#6b1e2e;font-weight:600;margin:0 0 12px">Alerta de precio</p>
  <h1 style="font-family:Georgia,serif;font-size:24px;line-height:1.2;margin:0 0 12px">${escapeHtml(wine)}</h1>
  <p style="font-size:15px;line-height:1.55;margin:0 0 20px">Te vamos a avisar ${escapeHtml(cond)}. Revisamos los precios de más de 100 vinotecas online todas las mañanas.</p>
  <p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:#1e3fbf;color:#f5ede0;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:999px">Confirmar mi alerta</a></p>
  <p style="font-size:12px;color:#4a5468;line-height:1.5;margin:0">Si no fuiste vos, ignorá este mail: sin confirmar, la alerta se borra sola en 7 días. No vendemos vino ni compartimos tu mail.</p>
</div>`;
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "vinndex-alerts/1.0",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [alert.email],
        subject: `Confirmá tu alerta: ${wine}`,
        text,
        html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
