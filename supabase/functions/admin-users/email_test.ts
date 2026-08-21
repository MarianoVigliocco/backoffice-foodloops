import { assertEquals, assertRejects, assertStringIncludes } from "std/assert";
import {
  buildDeactivationEmail,
  buildReactivationEmail,
  getEmailConfig,
  sendDeactivationEmail,
  sendReactivationEmail,
} from "./email.ts";

const config = {
  apiKey: "resend-test-key",
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
  assertEquals(email.to, ["ana@example.com"]);
  assertEquals(email.reply_to, "soporte@example.com");
  assertStringIncludes(email.text, "Hola, Ana Pérez:");
  assertStringIncludes(email.text, "fue desactivada temporalmente");
  assertStringIncludes(email.text, "soporte@example.com");
});

Deno.test("supports the existing legacy MAIL_FROM secret name", () => {
  const values: Record<string, string> = {
    RESEND_API_KEY: "resend-test-key",
    "MAIL_FROM\r\n\r\n": "FoodLoops <noreply@example.com>",
  };

  assertEquals(getEmailConfig((name) => values[name]), {
    apiKey: "resend-test-key",
    from: "FoodLoops <noreply@example.com>",
    supportEmail: "foodloops.team@gmail.com",
  });
});

Deno.test("builds the reactivation email in the same style", () => {
  const email = buildReactivationEmail(user, config);

  assertEquals(email.subject, "Tu cuenta de FoodLoops fue reactivada");
  assertEquals(email.to, ["ana@example.com"]);
  assertStringIncludes(email.text, "Hola, Ana Pérez:");
  assertStringIncludes(email.text, "fue reactivada");
  assertStringIncludes(
    email.text,
    "Ya podés volver a ingresar y utilizar las funcionalidades de tu cuenta.",
  );
  assertStringIncludes(email.html, "FoodLoops");
});

Deno.test("sends the email through Resend", async () => {
  let requestBody = "";
  const fetcher = (_input: string | URL | Request, init?: RequestInit) => {
    requestBody = String(init?.body ?? "");
    return Promise.resolve(new Response('{"id":"email-id"}', { status: 200 }));
  };

  await sendDeactivationEmail(user, config, fetcher);

  const payload = JSON.parse(requestBody);
  assertEquals(payload.to, ["ana@example.com"]);
  assertEquals(payload.from, "FoodLoops <noreply@example.com>");
});

Deno.test("reports provider failures", async () => {
  const fetcher = () =>
    Promise.resolve(
      new Response('{"message":"invalid sender"}', { status: 422 }),
    );

  await assertRejects(
    () => sendDeactivationEmail(user, config, fetcher),
    Error,
    "Resend returned 422",
  );
});

Deno.test("sends the reactivation email through Resend", async () => {
  let requestBody = "";
  const fetcher = (_input: string | URL | Request, init?: RequestInit) => {
    requestBody = String(init?.body ?? "");
    return Promise.resolve(new Response('{"id":"email-id"}', { status: 200 }));
  };

  await sendReactivationEmail(user, config, fetcher);

  const payload = JSON.parse(requestBody);
  assertEquals(payload.subject, "Tu cuenta de FoodLoops fue reactivada");
  assertEquals(payload.to, ["ana@example.com"]);
});
