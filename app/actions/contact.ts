"use server";

const REPO = "chequepa/vinndex";

export type ContactKind = "sumate" | "contacto" | "opt-out";

type ContactPayload = {
  kind: ContactKind;
  fields: Record<string, string>;
  honeypot?: string;
};

const LABELS: Record<ContactKind, string[]> = {
  sumate: ["vinoteca:nueva"],
  contacto: ["contacto"],
  "opt-out": ["vinoteca:opt-out"],
};

const TITLE_PREFIX: Record<ContactKind, string> = {
  sumate: "[sumate]",
  contacto: "[contacto]",
  "opt-out": "[opt-out]",
};

export async function submitContact(
  data: ContactPayload,
): Promise<{ ok: boolean; error?: string }> {
  if (data.honeypot && data.honeypot.trim()) {
    return { ok: true };
  }

  const token = process.env.GITHUB_ISSUES_TOKEN;
  if (!token) {
    console.error(
      "[contact] GITHUB_ISSUES_TOKEN not set — submission lost:",
      JSON.stringify({ kind: data.kind, fields: data.fields }),
    );
    return { ok: false, error: "service_unavailable" };
  }

  const titleField =
    data.fields.url ||
    data.fields.vinoteca ||
    data.fields.email ||
    data.fields.subject ||
    data.fields.asunto ||
    "(sin asunto)";
  const title = `${TITLE_PREFIX[data.kind]} ${String(titleField).slice(0, 80)}`;

  const fieldsBody = Object.entries(data.fields)
    .filter(([, v]) => v && String(v).trim())
    .map(([k, v]) => `**${k}**: ${v}`)
    .join("\n\n");

  const body = `_Form submission desde vinndex.com.ar/${data.kind}_\n\n${fieldsBody}`;

  let res: Response;
  try {
    res = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "vinndex-contact-form",
      },
      body: JSON.stringify({
        title,
        body,
        labels: LABELS[data.kind],
      }),
      cache: "no-store",
    });
  } catch (err) {
    console.error("[contact] fetch failed:", err);
    return { ok: false, error: "network" };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    console.error("[contact] GitHub API error:", res.status, text);
    return { ok: false, error: "service_unavailable" };
  }

  return { ok: true };
}
