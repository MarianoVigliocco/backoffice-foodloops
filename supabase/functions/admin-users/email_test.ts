import { assertEquals, assertRejects, assertStringIncludes } from "std/assert";
import {
  buildDeactivationEmail,
  buildReactivationEmail,
  getEmailConfig,
  sendDeactivationEmail,
  sendReactivationEmail,
} from "./email.ts";

const config = {
  host: "smtp.example.com",
  port: 465,
  secure: true,
  username: "smtp-user",
  password: "smtp-password",
  from: "FoodLoops <noreply@example.com>",
  supportEmail: "soporte@example.com",
};

const user = {
  email: "ana@example.com",
  name: "Ana",
  last_name: "Pérez",
};

Deno.test("builds the approved deactivation email", () => {
  const email = buildDeactivationEmail(user, config);

  assertEquals(
    email.subject,
    "Tu cuenta de FoodLoops fue desactivada temporalmente",
  );
  assertEquals(email.to, "ana@example.com");
  assertEquals(email.replyTo, "soporte@example.com");
  assertStringIncludes(email.text, "Hola, Ana Pérez:");
  assertStringIncludes(email.text, "fue desactivada temporalmente");
  assertStringIncludes(email.text, "soporte@example.com");
});

Deno.test("loads the SMTP configuration from Supabase secrets", () => {
  const values: Record<string, string> = {
    SMTP_HOST: "smtp.gmail.com",
    SMTP_PORT: "465",
    SMTP_USER: "foodloops@example.com",
    SMTP_PASSWORD: "app-password",
    "MAIL_FROM\r\n\r\n": "FoodLoops <noreply@example.com>",
  };

  assertEquals(getEmailConfig((name) => values[name]), {
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    username: "foodloops@example.com",
    password: "app-password",
    from: "FoodLoops <noreply@example.com>",
    supportEmail: "foodloops.team@gmail.com",
  });
});

Deno.test("builds the reactivation email in the same style", () => {
  const email = buildReactivationEmail(user, config);

  assertEquals(email.subject, "Tu cuenta de FoodLoops fue reactivada");
  assertEquals(email.to, "ana@example.com");
  assertStringIncludes(email.text, "Hola, Ana Pérez:");
  assertStringIncludes(email.text, "fue reactivada");
  assertStringIncludes(
    email.text,
    "Ya podés volver a ingresar y utilizar las funcionalidades de tu cuenta.",
  );
  assertStringIncludes(email.html, "FoodLoops");
});

Deno.test("sends the email through the configured SMTP server", async () => {
  let sentMessage: unknown;
  let closed = false;
  const createTransport = () => ({
    sendMail: (message: unknown) => {
      sentMessage = message;
      return Promise.resolve({ messageId: "email-id" });
    },
    close: () => {
      closed = true;
    },
  });

  await sendDeactivationEmail(user, config, createTransport);

  const message = sentMessage as { to: string; from: string };
  assertEquals(message.to, "ana@example.com");
  assertEquals(message.from, "FoodLoops <noreply@example.com>");
  assertEquals(closed, true);
});

Deno.test("reports SMTP failures", async () => {
  const createTransport = () => ({
    sendMail: (_message: unknown) =>
      Promise.reject(new Error("SMTP authentication failed")),
    close: () => undefined,
  });

  await assertRejects(
    () => sendDeactivationEmail(user, config, createTransport),
    Error,
    "SMTP authentication failed",
  );
});

Deno.test("sends the reactivation email through SMTP", async () => {
  let sentMessage: unknown;
  const createTransport = () => ({
    sendMail: (message: unknown) => {
      sentMessage = message;
      return Promise.resolve({ messageId: "email-id" });
    },
    close: () => undefined,
  });

  await sendReactivationEmail(user, config, createTransport);

  const message = sentMessage as { subject: string; to: string };
  assertEquals(message.subject, "Tu cuenta de FoodLoops fue reactivada");
  assertEquals(message.to, "ana@example.com");
});

Deno.test("rejects incomplete SMTP configuration", () => {
  const values: Record<string, string> = {
    SMTP_HOST: "smtp.gmail.com",
    SMTP_PORT: "465",
    SMTP_USER: "foodloops@example.com",
  };

  assertEquals(getEmailConfig((name) => values[name]), null);
});
