export type EmailConfig = {
  apiKey: string;
  from: string;
  supportEmail: string;
};

export type DeactivationEmailUser = {
  email: string;
  name: string | null;
  last_name: string | null;
};

type ReadEnv = (name: string) => string | undefined;
type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type AccountStatus = "deactivated" | "reactivated";

export function getEmailConfig(
  readEnv: ReadEnv = (name) => Deno.env.get(name),
): EmailConfig | null {
  const apiKey = readEnv("RESEND_API_KEY")?.trim();
  const from = (
    readEnv("MAIL_FROM") ?? readEnv("MAIL_FROM\r\n\r\n")
  )?.trim();
  const supportEmail = readEnv("SUPPORT_EMAIL")?.trim() ||
    "foodloops.team@gmail.com";

  if (!apiKey || !from) return null;
  return { apiKey, from, supportEmail };
}

export function buildDeactivationEmail(
  user: DeactivationEmailUser,
  config: EmailConfig,
) {
  return buildAccountStatusEmail(user, config, "deactivated");
}

export function buildReactivationEmail(
  user: DeactivationEmailUser,
  config: EmailConfig,
) {
  return buildAccountStatusEmail(user, config, "reactivated");
}

function buildAccountStatusEmail(
  user: DeactivationEmailUser,
  config: EmailConfig,
  status: AccountStatus,
) {
  const displayName = [user.name, user.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const greeting = displayName ? `Hola, ${displayName}:` : "Hola:";
  const deactivated = status === "deactivated";
  const subject = deactivated
    ? "Tu cuenta de FoodLoops fue desactivada temporalmente"
    : "Tu cuenta de FoodLoops fue reactivada";
  const statusSentence = deactivated
    ? "fue desactivada temporalmente"
    : "fue reactivada";
  const accessSentence = deactivated
    ? "Mientras permanezca desactivada, no podrás ingresar ni utilizar las funcionalidades de tu cuenta."
    : "Ya podés volver a ingresar y utilizar las funcionalidades de tu cuenta.";
  const helpSentence = deactivated
    ? `Si creés que esto se debe a un error o necesitás más información, respondé a este correo o comunicate con nuestro equipo en ${config.supportEmail}. Revisaremos tu caso a la brevedad.`
    : `Si tenés alguna duda o necesitás más información, respondé a este correo o comunicate con nuestro equipo en ${config.supportEmail}. Revisaremos tu consulta a la brevedad.`;
  const preview = deactivated
    ? "Te informamos que tu cuenta fue desactivada temporalmente."
    : "Te informamos que tu cuenta fue reactivada.";
  const safeEmail = escapeHtml(user.email);
  const safeGreeting = escapeHtml(greeting);
  const safeSupportEmail = escapeHtml(config.supportEmail);

  const text = `${greeting}

Te informamos que tu cuenta de FoodLoops asociada a ${user.email} ${statusSentence}.

${accessSentence}

${helpSentence}

Saludos,
El equipo de FoodLoops`;

  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;background:#f4f7f2;font-family:Arial,sans-serif;color:#253129;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      ${preview}
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7f2;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #dfe8dc;">
            <tr>
              <td style="background:#245c3a;padding:24px 32px;color:#ffffff;font-size:24px;font-weight:700;">
                FoodLoops
              </td>
            </tr>
            <tr>
              <td style="padding:32px;font-size:16px;line-height:1.6;">
                <p style="margin:0 0 20px;">${safeGreeting}</p>
                <p style="margin:0 0 20px;">
                  Te informamos que tu cuenta de FoodLoops asociada a
                  <strong>${safeEmail}</strong> ${statusSentence}.
                </p>
                <p style="margin:0 0 20px;">
                  ${accessSentence}
                </p>
                <p style="margin:0 0 28px;">
                  ${
    deactivated
      ? "Si creés que esto se debe a un error o necesitás más información"
      : "Si tenés alguna duda o necesitás más información"
  }, respondé a este correo o comunicate con nuestro equipo en
                  <a href="mailto:${safeSupportEmail}" style="color:#245c3a;font-weight:600;">${safeSupportEmail}</a>.
                  ${
    deactivated
      ? "Revisaremos tu caso a la brevedad."
      : "Revisaremos tu consulta a la brevedad."
  }
                </p>
                <p style="margin:0;">Saludos,<br><strong>El equipo de FoodLoops</strong></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {
    from: config.from,
    to: [user.email],
    reply_to: config.supportEmail,
    subject,
    text,
    html,
  };
}

export function sendDeactivationEmail(
  user: DeactivationEmailUser,
  config: EmailConfig,
  fetcher: Fetcher = fetch,
) {
  return sendEmail(buildDeactivationEmail(user, config), config, fetcher);
}

export function sendReactivationEmail(
  user: DeactivationEmailUser,
  config: EmailConfig,
  fetcher: Fetcher = fetch,
) {
  return sendEmail(buildReactivationEmail(user, config), config, fetcher);
}

async function sendEmail(
  email: ReturnType<typeof buildDeactivationEmail>,
  config: EmailConfig,
  fetcher: Fetcher,
) {
  const response = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(email),
  });

  if (!response.ok) {
    const details = (await response.text().catch(() => "")).slice(0, 500);
    throw new Error(`Resend returned ${response.status}: ${details}`);
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
