// supabase/functions/admin-users/helper.ts
import { createClient } from "@supabase/supabase-js";
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Ajustá el Origin si querés restringir al dominio del backoffice
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
};
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
export async function requireAdmin(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return {
      error: "Missing bearer token",
    };
  }
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user || !user.email) {
    console.log("auth error", error);
    return {
      error: "Invalid token",
    };
  }
  const { data: admin, error: adminErr } = await supabaseAdmin.from(
    "admin_users",
  ).select("email").eq("email", user.email).maybeSingle();
  if (adminErr) {
    console.error("admin query error", adminErr);
  }
  if (!admin) {
    return {
      error: "Not allowed",
    };
  }
  return {
    user,
    supabaseAdmin,
  };
}
export function qp(url: string) {
  const u = new URL(url);
  const out: Record<string, string> = {};
  u.searchParams.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}
export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
