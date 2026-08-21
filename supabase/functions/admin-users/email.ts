// @deno-types="npm:@types/nodemailer@8.0.1"
import nodemailer from "npm:nodemailer@9.0.5";

export type EmailConfig = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  from: string;
  supportEmail: string;
};

export type DeactivationEmailUser = {
  email: string;
  name: string | null;
  last_name: string | null;
};

type ReadEnv = (name: string) => string | undefined;
type MailMessage = ReturnType<typeof buildDeactivationEmail>;
type MailTransport = {
  sendMail: (message: MailMessage) => Promise<unknown>;
  close?: () => void;
};
type TransportFactory = (config: EmailConfig) => MailTransport;

type AccountStatus = "deactivated" | "reactivated";

export function getEmailConfig(
  readEnv: ReadEnv = (name) => Deno.env.get(name),
): EmailConfig | null {
  const host = readEnv("SMTP_HOST")?.trim();
  const portText = readEnv("SMTP_PORT")?.trim() || "465";
  const port = Number(portText);
  const username = readEnv("SMTP_USER")?.trim();
  const password = readEnv("SMTP_PASSWORD")?.trim();
  const from = (
    readEnv("MAIL_FROM") ?? readEnv("MAIL_FROM\r\n\r\n")
  )?.trim();
  const supportEmail = readEnv("SUPPORT_EMAIL")?.trim() ||
    "foodloops.team@gmail.com";
  const secureSetting = readEnv("SMTP_SECURE")?.trim().toLowerCase();
  const secure = secureSetting ? secureSetting === "true" : port === 465;

  if (
    !host || !Number.isInteger(port) || port < 1 || port > 65535 ||
    !username || !password || !from
  ) return null;

  return {
    host,
    port,
    secure,
    username,
    password,
    from,
    supportEmail,
  };
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
    to: user.email,
    replyTo: config.supportEmail,
    subject,
    text,
    html,
  };
}

export function sendDeactivationEmail(
  user: DeactivationEmailUser,
  config: EmailConfig,
  createTransport: TransportFactory = createSmtpTransport,
) {
  return sendEmail(
    buildDeactivationEmail(user, config),
    config,
    createTransport,
  );
}

export function sendReactivationEmail(
  user: DeactivationEmailUser,
  config: EmailConfig,
  createTransport: TransportFactory = createSmtpTransport,
) {
  return sendEmail(
    buildReactivationEmail(user, config),
    config,
    createTransport,
  );
}

async function sendEmail(
  email: MailMessage,
  config: EmailConfig,
  createTransport: TransportFactory,
) {
  const transport = createTransport(config);
  try {
    await transport.sendMail(email);
  } finally {
    transport.close?.();
  }
}

function createSmtpTransport(config: EmailConfig): MailTransport {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.username,
      pass: config.password,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
