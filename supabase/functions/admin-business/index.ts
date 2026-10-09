import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

const PAGE_SIZE = 1000;
const PARTNER_TYPES = new Set(["brand", "supermarket", "creator", "other"]);
const STATUSES = new Set(["planned", "active", "completed", "cancelled"]);
const PLATFORMS = new Set(["Instagram", "TikTok"]);

function localToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Cordoba",
  }).format(new Date());
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requireAdmin(req: Request) {
  const token = (req.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) return { error: "Missing bearer token" };

  const { data: { user }, error } = await adminClient.auth.getUser(token);
  if (error || !user?.email) return { error: "Invalid token" };

  const { data: admin, error: adminError } = await adminClient
    .from("admin_users")
    .select("email")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();
  if (adminError) throw adminError;
  if (!admin) return { error: "Not allowed" };
  return { user };
}

async function fetchAll(buildQuery: () => any, label: string) {
  const rows: any[] = [];
  for (let page = 0; page < 1000; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

function normalizeUsername(raw: unknown) {
  let value = String(raw ?? "").trim();
  if (!value) return null;
  try {
    if (/^https?:\/\//i.test(value)) {
      const url = new URL(value);
      value = url.pathname.split("/").filter(Boolean).pop() ?? "";
    }
  } catch {
    return null;
  }
  value = value.replace(/^@+/, "").trim();
  const rejected = new Set([
    "unknown",
    "desconocido",
    "sin autor",
    "sinautor",
    "null",
    "undefined",
    "n/a",
  ]);
  return !value || rejected.has(value.toLowerCase()) ? null : value;
}

function normalizePlatform(raw: unknown) {
  const value = String(raw ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (value === "instagram" || value === "instagramreels" || value === "reels") {
    return "Instagram";
  }
  if (value === "tiktok") return "TikTok";
  return null;
}

function creatorKey(username: string, platform: string) {
  return `${platform}|${username.toLocaleLowerCase()}`;
}

function isAgreementActive(agreement: any, today: string) {
  return agreement.status === "active" &&
    agreement.starts_on <= today &&
    (!agreement.ends_on || agreement.ends_on >= today);
}

function buildCreatorMetrics(recipes: any[], saves: any[], agreements: any[]) {
  const today = localToday();
  const activePartnerKeys = new Set(
    agreements.flatMap((agreement) => {
      const username = normalizeUsername(agreement.source_username);
      const platform = normalizePlatform(agreement.source_platform);
      return username && platform && isAgreementActive(agreement, today)
        ? [creatorKey(username, platform)]
        : [];
    }),
  );

  const savesByRecipe = new Map<number, Array<{ user_id: number }>>();
  saves.forEach((save) => {
    const recipeId = Number(save.recipe_id);
    const userId = Number(save.user_id);
    if (!Number.isFinite(recipeId) || !Number.isFinite(userId)) return;
    const current = savesByRecipe.get(recipeId) ?? [];
    current.push({ user_id: userId });
    savesByRecipe.set(recipeId, current);
  });

  const creators = new Map<string, {
    username: string;
    platform: "Instagram" | "TikTok";
    recipeIds: Set<number>;
    users: Set<number>;
    recipesByUser: Map<number, Set<number>>;
    saves: number;
  }>();
  let unattributedRecipes = 0;

  recipes.forEach((recipe) => {
    const username = normalizeUsername(recipe.source_username);
    const platform = normalizePlatform(recipe.source_platform);
    const recipeId = Number(recipe.id_recipe);
    if (!username || !platform || !Number.isFinite(recipeId)) {
      unattributedRecipes += 1;
      return;
    }

    const key = creatorKey(username, platform);
    const creator = creators.get(key) ?? {
      username,
      platform,
      recipeIds: new Set<number>(),
      users: new Set<number>(),
      recipesByUser: new Map<number, Set<number>>(),
      saves: 0,
    };
    creator.recipeIds.add(recipeId);
    (savesByRecipe.get(recipeId) ?? []).forEach((save) => {
      creator.saves += 1;
      creator.users.add(save.user_id);
      const savedRecipes = creator.recipesByUser.get(save.user_id) ?? new Set<number>();
      savedRecipes.add(recipeId);
      creator.recipesByUser.set(save.user_id, savedRecipes);
    });
    creators.set(key, creator);
  });

  const uniqueUsers = new Set<number>();
  const rows = [...creators.entries()].map(([key, creator]) => {
    creator.users.forEach((userId) => uniqueUsers.add(userId));
    const recurrentUsers = [...creator.recipesByUser.values()]
      .filter((recipeIds) => recipeIds.size >= 2).length;
    return {
      username: creator.username,
      platform: creator.platform,
      reached_users: creator.users.size,
      attributed_recipes: creator.recipeIds.size,
      saves: creator.saves,
      recurrent_users: recurrentUsers,
      recurrence_rate: creator.users.size
        ? Math.round((recurrentUsers / creator.users.size) * 1000) / 10
        : 0,
      has_active_agreement: activePartnerKeys.has(key),
    };
  }).sort((a, b) =>
    b.reached_users - a.reached_users || b.saves - a.saves ||
    b.attributed_recipes - a.attributed_recipes ||
    a.username.localeCompare(b.username)
  );

  return {
    rows,
    uniqueUsers: uniqueUsers.size,
    unattributedRecipes,
  };
}

function optionalText(
  value: unknown,
  field: string,
  maxLength: number,
  options: { required?: boolean; nullable?: boolean } = {},
) {
  if (value === undefined) return options.required ? { error: `${field} is required` } : { present: false as const };
  if (value === null || String(value).trim() === "") {
    if (options.required) return { error: `${field} is required` };
    return { present: true as const, value: options.nullable === false ? "" : null };
  }
  const text = String(value).trim();
  if (text.length > maxLength) return { error: `${field} is too long` };
  return { present: true as const, value: text };
}

function optionalTarget(value: unknown, field: string) {
  if (value === undefined) return { present: false as const };
  if (value === null || value === "") return { present: true as const, value: null };
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 1_000_000_000) {
    return { error: `${field} must be an integer between 0 and 1000000000` };
  }
  return { present: true as const, value: parsed };
}

function validateAgreement(body: any, isUpdate: boolean) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Invalid JSON body" };
  }
  const values: Record<string, unknown> = {};
  const required = !isUpdate;

  const partnerName = optionalText(body.partner_name, "partner_name", 160, { required });
  if ("error" in partnerName) return partnerName;
  if (partnerName.present) values.partner_name = partnerName.value;

  const partnerType = optionalText(body.partner_type, "partner_type", 32, { required });
  if ("error" in partnerType) return partnerType;
  if (partnerType.present) {
    if (!PARTNER_TYPES.has(String(partnerType.value))) return { error: "Invalid partner_type" };
    values.partner_type = partnerType.value;
  }

  const sourceUsername = optionalText(body.source_username, "source_username", 160);
  if ("error" in sourceUsername) return sourceUsername;
  if (sourceUsername.present) values.source_username = normalizeUsername(sourceUsername.value);

  const sourcePlatform = optionalText(body.source_platform, "source_platform", 20);
  if ("error" in sourcePlatform) return sourcePlatform;
  if (sourcePlatform.present) {
    const platform = sourcePlatform.value == null ? null : normalizePlatform(sourcePlatform.value);
    if (sourcePlatform.value != null && (!platform || !PLATFORMS.has(platform))) {
      return { error: "Invalid source_platform" };
    }
    values.source_platform = platform;
  }

  const startsOn = optionalText(body.starts_on, "starts_on", 10, { required });
  if ("error" in startsOn) return startsOn;
  if (startsOn.present) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startsOn.value))) return { error: "Invalid starts_on" };
    values.starts_on = startsOn.value;
  }

  const endsOn = optionalText(body.ends_on, "ends_on", 10);
  if ("error" in endsOn) return endsOn;
  if (endsOn.present) {
    if (endsOn.value != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(endsOn.value))) {
      return { error: "Invalid ends_on" };
    }
    values.ends_on = endsOn.value;
  }

  const status = optionalText(body.status, "status", 20, { required });
  if ("error" in status) return status;
  if (status.present) {
    if (!STATUSES.has(String(status.value))) return { error: "Invalid status" };
    values.status = status.value;
  }

  if (body.agreed_amount !== undefined) {
    if (body.agreed_amount === null || body.agreed_amount === "") {
      values.agreed_amount = null;
    } else {
      const amount = Number(body.agreed_amount);
      if (!Number.isFinite(amount) || amount < 0 || amount > 999_999_999_999.99) {
        return { error: "Invalid agreed_amount" };
      }
      values.agreed_amount = Math.round(amount * 100) / 100;
    }
  }

  const targetReachedUsers = optionalTarget(body.target_reached_users, "target_reached_users");
  if ("error" in targetReachedUsers) return targetReachedUsers;
  if (targetReachedUsers.present) values.target_reached_users = targetReachedUsers.value;

  const targetSaves = optionalTarget(body.target_saves, "target_saves");
  if ("error" in targetSaves) return targetSaves;
  if (targetSaves.present) values.target_saves = targetSaves.value;

  const currency = optionalText(body.currency, "currency", 3, { required });
  if ("error" in currency) return currency;
  if (currency.present) {
    const normalized = String(currency.value).toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalized)) return { error: "Invalid currency" };
    values.currency = normalized;
  }

  const notes = optionalText(body.notes, "notes", 2000);
  if ("error" in notes) return notes;
  if (notes.present) values.notes = notes.value;

  const start = String(values.starts_on ?? body.starts_on ?? "");
  const end = values.ends_on === null ? "" : String(values.ends_on ?? body.ends_on ?? "");
  if (start && end && end < start) return { error: "ends_on cannot be before starts_on" };
  if (isUpdate && Object.keys(values).length === 0) return { error: "No editable fields were provided" };
  return { values };
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = await requireAdmin(req);
    if ("error" in auth) return json({ error: auth.error }, 401);

    if (req.method === "GET") {
      const [agreements, recipes, saves] = await Promise.all([
        fetchAll(
          () => adminClient.from("commercial_agreements").select("*")
            .order("starts_on", { ascending: false })
            .order("id_commercial_agreement", { ascending: false }),
          "commercial agreements",
        ),
        fetchAll(
          () => adminClient.from("recipes").select("id_recipe, source_platform, source_username"),
          "attributed recipes",
        ),
        fetchAll(
          () => adminClient.from("user_saved_recipes").select("user_id, recipe_id, saved_at"),
          "saved recipes",
        ),
      ]);
      const creatorMetrics = buildCreatorMetrics(recipes, saves, agreements);
      const today = localToday();
      return json({
        ok: true,
        agreements,
        creators: creatorMetrics.rows,
        summary: {
          agreements: agreements.length,
          active_agreements: agreements.filter((row) => isAgreementActive(row, today)).length,
          creators: creatorMetrics.rows.length,
          attributed_recipes: creatorMetrics.rows.reduce((sum, row) => sum + row.attributed_recipes, 0),
          saves: creatorMetrics.rows.reduce((sum, row) => sum + row.saves, 0),
          reached_users: creatorMetrics.uniqueUsers,
        },
        data_quality: {
          audience_basis: "saved_recipes",
          view_events_available: false,
          unattributed_recipes: creatorMetrics.unattributedRecipes,
        },
      });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => null);
      const validated = validateAgreement(body, false);
      if ("error" in validated) return json({ error: validated.error }, 400);
      const { data, error } = await adminClient.from("commercial_agreements")
        .insert(validated.values).select("*").single();
      if (error) throw error;
      return json({ ok: true, data }, 201);
    }

    if (req.method === "PATCH") {
      const body = await req.json().catch(() => null);
      const agreementId = positiveInteger(body?.id_commercial_agreement);
      if (!agreementId) return json({ error: "Invalid id_commercial_agreement" }, 400);
      const validated = validateAgreement(body, true);
      if ("error" in validated) return json({ error: validated.error }, 400);
      const { data, error } = await adminClient.from("commercial_agreements")
        .update(validated.values).eq("id_commercial_agreement", agreementId)
        .select("*").maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "Commercial agreement not found" }, 404);
      return json({ ok: true, data });
    }

    if (req.method === "DELETE") {
      const agreementId = positiveInteger(new URL(req.url).searchParams.get("id"));
      if (!agreementId) return json({ error: "Invalid agreement id" }, 400);
      const { data, error } = await adminClient.from("commercial_agreements")
        .delete().eq("id_commercial_agreement", agreementId)
        .select("id_commercial_agreement").maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "Commercial agreement not found" }, 404);
      return json({ ok: true, id_commercial_agreement: agreementId });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (error) {
    console.error("admin-business error", error);
    return json({ error: "No se pudo completar la operación" }, 500);
  }
});
