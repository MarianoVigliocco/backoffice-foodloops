import { corsHeaders, json, qp, requireAdmin } from "./helper.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getEmailConfig,
  sendDeactivationEmail,
  sendReactivationEmail,
} from "./email.ts";

const SORTABLE_COLUMNS = new Set([
  "id_user",
  "name",
  "email",
  "country",
  "created_at",
  "enabled",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const auth = await requireAdmin(req);
  if ("error" in auth) return json({ error: auth.error }, 401);

  const { supabaseAdmin } = auth;

  try {
    if (req.method === "GET") {
      const {
        q,
        page,
        pageSize,
        sortBy,
        sortDirection,
      } = normalizeQuery(qp(req.url));
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const ascending = sortDirection === "asc";

      let query = supabaseAdmin
        .from("users")
        .select(
          `
            id_user,
            email,
            name,
            last_name,
            created_at,
            id_country,
            id_gender,
            enabled,
            countries(name)
          `,
          { count: "exact" },
        )
        .range(from, to);

      if (q) {
        const escapedQuery = q.replaceAll(",", " ");
        query = query.or(
          `email.ilike.%${escapedQuery}%,name.ilike.%${escapedQuery}%,last_name.ilike.%${escapedQuery}%`,
        );
      }

      if (sortBy === "country") {
        query = query.order("name", {
          ascending,
          referencedTable: "countries",
          nullsFirst: false,
        });
      } else if (sortBy === "name") {
        query = query
          .order("name", { ascending, nullsFirst: false })
          .order("last_name", { ascending, nullsFirst: false });
      } else {
        query = query.order(sortBy, { ascending, nullsFirst: false });
      }

      const { data, error, count } = await query;
      if (error) {
        console.error("admin-users GET error", error);
        return json({ error: "Failed to fetch users" }, 500);
      }

      const rows = (data ?? []).map((user) => {
        const countries = user.countries as unknown as
          | { name: string }[]
          | { name: string }
          | null;
        const country = Array.isArray(countries)
          ? countries[0]?.name ?? null
          : countries?.name ?? null;

        return {
          ...user,
          country,
          countries: undefined,
        };
      });

      return json({
        ok: true,
        data: rows,
        total: count ?? 0,
        page,
        pageSize,
        sortBy,
        sortDirection,
      });
    }

    if (req.method === "PATCH") {
      const body = await safeJson(req);
      if (!body) return json({ error: "Invalid JSON body" }, 400);

      const { id_user, enabled } = body;
      if (!id_user) return json({ error: "id_user is required" }, 400);
      if (typeof enabled !== "boolean") {
        return json({ error: "enabled must be a boolean" }, 400);
      }

      const { data: currentUser, error: currentUserError } = await supabaseAdmin
        .from("users")
        .select("id_user, email, name, last_name, enabled")
        .eq("id_user", id_user)
        .single();

      if (currentUserError || !currentUser) {
        return json({ error: "User not found" }, 404);
      }

      const { data: adminAccount } = await supabaseAdmin
        .from("admin_users")
        .select("email")
        .ilike("email", currentUser.email)
        .maybeSingle();

      if (adminAccount) {
        return json({ error: "Admin users cannot be deactivated here" }, 409);
      }

      const shouldSendStatusEmail = currentUser.enabled !== enabled;
      const emailConfig = shouldSendStatusEmail ? getEmailConfig() : null;

      if (shouldSendStatusEmail && !emailConfig) {
        console.error("admin-users email configuration is incomplete");
        return json({ error: "El envío de emails no está configurado" }, 500);
      }

      const { data, error } = await supabaseAdmin
        .from("users")
        .update({ enabled })
        .eq("id_user", id_user)
        .select(
          "id_user, email, name, last_name, created_at, id_country, id_gender, enabled",
        )
        .single();

      if (error) {
        console.error("admin-users PATCH error", error);
        return json({ error: "Failed to update user" }, 500);
      }

      let authUser: Awaited<ReturnType<typeof findAuthUserByEmail>> = null;
      try {
        authUser = await findAuthUserByEmail(currentUser.email, supabaseAdmin);
        if (authUser) {
          const { error: authError } = await supabaseAdmin.auth.admin
            .updateUserById(
              authUser.id,
              { ban_duration: enabled ? "none" : "876000h" },
            );
          if (authError) throw authError;
        }
      } catch (authError) {
        console.error("admin-users auth state update error", authError);
        await supabaseAdmin
          .from("users")
          .update({ enabled: currentUser.enabled })
          .eq("id_user", id_user);
        return json({ error: "Failed to update authentication state" }, 500);
      }

      if (shouldSendStatusEmail && emailConfig) {
        try {
          const sendStatusEmail = enabled
            ? sendReactivationEmail
            : sendDeactivationEmail;
          await sendStatusEmail(currentUser, emailConfig);
        } catch (emailError) {
          console.error("admin-users account status email error", emailError);

          if (authUser) {
            const { error: authRollbackError } = await supabaseAdmin.auth.admin
              .updateUserById(
                authUser.id,
                {
                  ban_duration: currentUser.enabled === false
                    ? "876000h"
                    : "none",
                },
              );
            if (authRollbackError) {
              console.error(
                "admin-users auth rollback error",
                authRollbackError,
              );
            }
          }

          const { error: userRollbackError } = await supabaseAdmin
            .from("users")
            .update({ enabled: currentUser.enabled })
            .eq("id_user", id_user);
          if (userRollbackError) {
            console.error(
              "admin-users database rollback error",
              userRollbackError,
            );
          }

          return json({
            error: enabled
              ? "No se pudo enviar el email. El usuario no fue reactivado"
              : "No se pudo enviar el email. El usuario no fue desactivado",
          }, 502);
        }
      }

      return json({ ok: true, data });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (error) {
    console.error("admin-users unhandled error", error);
    return json({ error: "Internal server error" }, 500);
  }
});

function normalizeQuery(raw: Record<string, string>) {
  const requestedSort = raw.sortBy ?? "created_at";

  return {
    q: String(raw.q ?? raw.query ?? "").trim(),
    page: Math.max(1, Number(raw.page ?? "1")),
    pageSize: Math.min(100, Math.max(1, Number(raw.pageSize ?? "20"))),
    sortBy: SORTABLE_COLUMNS.has(requestedSort) ? requestedSort : "created_at",
    sortDirection: raw.sortDirection === "asc" ? "asc" : "desc",
  };
}

async function findAuthUserByEmail(
  email: string,
  supabaseAdmin: SupabaseClient,
) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const perPage = 1000;

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw error;

    const match = data.users.find(
      (user) => user.email?.trim().toLowerCase() === normalizedEmail,
    );
    if (match) return match;
    if (data.users.length < perPage) return null;
  }

  return null;
}

async function safeJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
