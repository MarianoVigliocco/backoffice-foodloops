import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  activation,
  activeUserMix,
  type ActivityEvent,
  type AnalyticsRange,
  type AnalyticsUser,
  compareCohortStats,
  DAY_MS,
  median,
  metricPoint,
  percentage,
  previousRange,
  ratePerActiveUser,
  retention,
  timeToFirstValue,
  uniqueUsers,
  usersRegisteredInRange,
} from "./analytics.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 366;
const PAGE_SIZE = 1000;

type DateRange = AnalyticsRange & {
  timezone: string;
  days: number;
};

type TopAuthor = {
  username: string;
  platform: "Instagram" | "TikTok";
  recipes: number;
  saves: number;
};

type ImportEventRow = {
  id: string;
  id_user: number | null;
  platform: string;
  status: "started" | "succeeded" | "failed";
  error_code: string | null;
  duration_ms: number | null;
  created_at: string;
};

function json(status: number, body: unknown) {
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

function parseRange(req: Request): DateRange {
  const url = new URL(req.url);
  const now = new Date();
  const rawFrom = url.searchParams.get("from");
  const rawTo = url.searchParams.get("to");
  const timezone = url.searchParams.get("timezone") ||
    "America/Argentina/Cordoba";

  const toExclusive = rawTo ? new Date(rawTo) : now;
  const from = rawFrom
    ? new Date(rawFrom)
    : new Date(toExclusive.getTime() - DEFAULT_RANGE_DAYS * DAY_MS);

  if (
    !Number.isFinite(from.getTime()) ||
    !Number.isFinite(toExclusive.getTime()) ||
    toExclusive <= from
  ) {
    throw new Error("INVALID_DATE_RANGE");
  }

  const duration = toExclusive.getTime() - from.getTime();
  if (duration > MAX_RANGE_DAYS * DAY_MS + 60 * 60 * 1000) {
    throw new Error("DATE_RANGE_TOO_LARGE");
  }

  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
  } catch {
    throw new Error("INVALID_TIMEZONE");
  }

  return {
    from,
    toExclusive,
    timezone,
    days: Math.max(1, Math.ceil(duration / DAY_MS)),
  };
}

async function fetchAll(buildQuery: () => any, label: string): Promise<any[]> {
  const rows: any[] = [];
  for (let page = 0; page < 1000; page += 1) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await buildQuery().range(from, to);
    if (error) throw new Error(`${label}: ${error.message}`);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

async function fetchOptional(
  buildQuery: () => any,
  label: string,
): Promise<any[]> {
  try {
    return await fetchAll(buildQuery, label);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("does not exist") || message.includes("schema cache")
    ) {
      console.warn(`${label} unavailable`, message);
      return [];
    }
    throw error;
  }
}

function dateKey(value: string | Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function recipesPerDay(rows: any[], range: DateRange) {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const key = dateKey(row.created_at, range.timezone);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  const result: { day: string; count: number }[] = [];
  for (
    let cursor = range.from.getTime();
    cursor < range.toExclusive.getTime();
    cursor += DAY_MS
  ) {
    const key = dateKey(new Date(cursor), range.timezone);
    if (!result.some((item) => item.day === key)) {
      result.push({ day: key, count: counts.get(key) ?? 0 });
    }
  }
  return result;
}

function recognizedPlatform(raw: unknown): "Instagram" | "TikTok" | null {
  const value = String(raw ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (
    value === "instagram" || value === "instagramreels" || value === "reels"
  ) return "Instagram";
  if (value === "tiktok") return "TikTok";
  return null;
}

function recognizedUsername(raw: unknown): string | null {
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

function buildTopAuthors(recipes: any[], saves: any[]): TopAuthor[] {
  const savesByRecipe = new Map<number, number>();
  saves.forEach((row) => {
    const recipeId = Number(row.recipe_id);
    if (Number.isFinite(recipeId)) {
      savesByRecipe.set(recipeId, (savesByRecipe.get(recipeId) ?? 0) + 1);
    }
  });

  const authors = new Map<string, TopAuthor>();
  recipes.forEach((recipe) => {
    const platform = recognizedPlatform(recipe.source_platform);
    const username = recognizedUsername(recipe.source_username);
    if (!platform || !username) return;
    const key = `${platform}|${username.toLocaleLowerCase()}`;
    const current = authors.get(key) ?? {
      username,
      platform,
      recipes: 0,
      saves: 0,
    };
    current.recipes += 1;
    current.saves += savesByRecipe.get(Number(recipe.id_recipe)) ?? 0;
    authors.set(key, current);
  });

  return [...authors.values()]
    .sort((a, b) =>
      b.recipes - a.recipes || b.saves - a.saves ||
      a.username.localeCompare(b.username)
    )
    .slice(0, 10);
}

function distribution(rows: any[], relation: string) {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const related = row[relation];
    const name = String(
      (Array.isArray(related) ? related[0]?.name : related?.name) ?? "",
    ).trim();
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, users]) => ({ name, users }));
}

function inRange(value: string, range: AnalyticsRange) {
  const timestamp = new Date(value).getTime();
  return timestamp >= range.from.getTime() &&
    timestamp < range.toExclusive.getTime();
}

function rangeEndingAt(end: Date, days: number, offsetDays = 0) {
  const toExclusive = new Date(end.getTime() - offsetDays * DAY_MS);
  return {
    from: new Date(toExclusive.getTime() - days * DAY_MS),
    toExclusive,
  };
}

function toAnalyticsUsers(rows: any[]): AnalyticsUser[] {
  return rows.flatMap((row) => {
    const id = Number(row.id_user);
    const createdAt = new Date(row.created_at);
    return Number.isFinite(id) && Number.isFinite(createdAt.getTime())
      ? [{ id, createdAt }]
      : [];
  });
}

function buildActivityEvents(
  recipes: any[],
  saves: any[],
  conversations: any[],
  mealPlans: any[],
  imports: ImportEventRow[],
) {
  const valueEvents: ActivityEvent[] = [];
  recipes.forEach((row) => {
    const userId = Number(row.id_user_creator);
    const at = new Date(row.created_at);
    if (Number.isFinite(userId) && Number.isFinite(at.getTime())) {
      valueEvents.push({ userId, at, kind: "recipe" });
    }
  });
  saves.forEach((row) => {
    const userId = Number(row.user_id);
    const at = new Date(row.saved_at);
    if (Number.isFinite(userId) && Number.isFinite(at.getTime())) {
      valueEvents.push({ userId, at, kind: "save" });
    }
  });
  imports.forEach((row) => {
    const userId = Number(row.id_user);
    const at = new Date(row.created_at);
    if (
      row.status === "succeeded" && Number.isFinite(userId) &&
      Number.isFinite(at.getTime())
    ) {
      valueEvents.push({ userId, at, kind: "import" });
    }
  });

  const activityEvents = [...valueEvents];
  conversations.forEach((row) => {
    const userId = Number(row.id_user);
    const at = new Date(row.last_message_at);
    if (Number.isFinite(userId) && Number.isFinite(at.getTime())) {
      activityEvents.push({ userId, at, kind: "conversation" });
    }
  });
  mealPlans.forEach((row) => {
    const userId = Number(row.id_user);
    const at = new Date(row.created_at);
    if (Number.isFinite(userId) && Number.isFinite(at.getTime())) {
      activityEvents.push({ userId, at, kind: "meal_plan" });
    }
  });
  return { valueEvents, activityEvents };
}

function segmentMemberships(rows: any[], relation: string) {
  const memberships = new Map<string, Set<number>>();
  rows.forEach((row) => {
    const related = row[relation];
    const name = String(
      (Array.isArray(related) ? related[0]?.name : related?.name) ?? "",
    ).trim();
    const userId = Number(row.user_id);
    if (!name || !Number.isFinite(userId)) return;
    const users = memberships.get(name) ?? new Set<number>();
    users.add(userId);
    memberships.set(name, users);
  });
  return memberships;
}

function countryMemberships(rows: any[]) {
  const memberships = new Map<string, Set<number>>();
  rows.forEach((row) => {
    const related = row.countries;
    const name = String(
      (Array.isArray(related) ? related[0]?.name : related?.name) ?? "",
    ).trim();
    const userId = Number(row.id_user);
    if (!name || !Number.isFinite(userId)) return;
    const users = memberships.get(name) ?? new Set<number>();
    users.add(userId);
    memberships.set(name, users);
  });
  return memberships;
}

function platformMemberships(recipes: any[], imports: ImportEventRow[]) {
  const memberships = new Map<string, Set<number>>([
    ["Instagram", new Set<number>()],
    ["TikTok", new Set<number>()],
  ]);
  recipes.forEach((row) => {
    const platform = recognizedPlatform(row.source_platform);
    const userId = Number(row.id_user_creator);
    if (platform && Number.isFinite(userId)) {
      memberships.get(platform)!.add(userId);
    }
  });
  imports.forEach((row) => {
    const platform = recognizedPlatform(row.platform);
    const userId = Number(row.id_user);
    if (platform && Number.isFinite(userId)) {
      memberships.get(platform)!.add(userId);
    }
  });
  return memberships;
}

function buildSegments(
  memberships: Map<string, Set<number>>,
  currentCohort: AnalyticsUser[],
  previousCohort: AnalyticsUser[],
  valueEvents: ActivityEvent[],
  activityEvents: ActivityEvent[],
  asOf: Date,
) {
  return [...memberships.entries()].map(([name, memberIds]) => {
    const current = currentCohort.filter((user) => memberIds.has(user.id));
    const previous = previousCohort.filter((user) => memberIds.has(user.id));
    return {
      name,
      users: current.length,
      previous_users: previous.length,
      activation: compareCohortStats(
        activation(current, valueEvents, asOf),
        activation(previous, valueEvents, asOf),
      ),
      retention_d7: compareCohortStats(
        retention(current, activityEvents, 7, asOf),
        retention(previous, activityEvents, 7, asOf),
      ),
      retention_d30: compareCohortStats(
        retention(current, activityEvents, 30, asOf),
        retention(previous, activityEvents, 30, asOf),
      ),
    };
  }).filter((row) => row.users > 0 || row.previous_users > 0)
    .sort((a, b) => b.users - a.users || a.name.localeCompare(b.name))
    .slice(0, 12);
}

function importStats(
  events: ImportEventRow[],
  recipes: any[],
  range: AnalyticsRange,
  now: Date,
) {
  const selectedEvents = events.filter((row) => inRange(row.created_at, range));
  const selectedRecipes = recipes.filter((row) =>
    inRange(row.created_at, range)
  );
  const staleBefore = now.getTime() - 10 * 60 * 1000;

  return ["Instagram", "TikTok"].map((platform) => {
    const platformEvents = selectedEvents.filter((row) =>
      recognizedPlatform(row.platform) === platform
    );
    const successes = platformEvents.filter((row) =>
      row.status === "succeeded"
    );
    const failures = platformEvents.filter((row) =>
      row.status === "failed" ||
      (row.status === "started" &&
        new Date(row.created_at).getTime() < staleBefore)
    );
    const pending = platformEvents.filter((row) =>
      row.status === "started" &&
      new Date(row.created_at).getTime() >= staleBefore
    );
    const durations = platformEvents.flatMap((row) =>
      row.duration_ms == null ? [] : [Number(row.duration_ms) / 1000]
    ).filter(Number.isFinite);

    return {
      platform,
      attempts: platformEvents.length,
      successes: successes.length,
      failures: failures.length,
      pending: pending.length,
      success_rate: percentage(
        successes.length,
        successes.length + failures.length,
      ),
      average_duration_seconds: durations.length
        ? Math.round(
          durations.reduce((sum, value) => sum + value, 0) / durations.length,
        )
        : null,
      median_duration_seconds: durations.length
        ? Math.round(median(durations))
        : null,
      imported_recipes: selectedRecipes.filter((row) =>
        recognizedPlatform(row.source_platform) === platform
      ).length,
    };
  });
}

function compareImportStats(current: any[], previous: any[]) {
  return current.map((row) => {
    const before = previous.find((item) => item.platform === row.platform);
    return {
      ...row,
      attempts_comparison: metricPoint(row.attempts, before?.attempts ?? 0),
      successes_comparison: metricPoint(row.successes, before?.successes ?? 0),
      failures_comparison: metricPoint(row.failures, before?.failures ?? 0),
      success_rate_comparison: metricPoint(
        row.success_rate,
        before?.success_rate ?? null,
      ),
      duration_comparison: metricPoint(
        row.average_duration_seconds,
        before?.average_duration_seconds ?? null,
      ),
      imported_recipes_comparison: metricPoint(
        row.imported_recipes,
        before?.imported_recipes ?? 0,
      ),
    };
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const auth = await requireAdmin(req);
    if ("error" in auth) return json(401, { error: auth.error });

    const range = parseRange(req);
    const previous = previousRange(range);
    const now = new Date();
    const eventFrom = new Date(Math.min(
      previous.from.getTime(),
      now.getTime() - 61 * DAY_MS,
    )).toISOString();
    const eventTo = now.toISOString();
    const from = range.from.toISOString();
    const to = range.toExclusive.toISOString();

    const [
      userRows,
      recipes,
      saves,
      conversations,
      mealPlans,
      selectedTags,
      currentDiets,
      currentAllergies,
      importEvents,
    ] = await Promise.all([
      fetchAll(
        () =>
          adminClient.from("users").select(
            "id_user, created_at, countries(name)",
          ),
        "users",
      ),
      fetchAll(
        () =>
          adminClient.from("recipes").select(
            "id_recipe, id_user_creator, created_at, source_platform, source_username",
          ).gte("created_at", eventFrom).lt("created_at", eventTo),
        "recipes",
      ),
      fetchAll(
        () =>
          adminClient.from("user_saved_recipes").select(
            "user_id, recipe_id, saved_at",
          ).gte("saved_at", eventFrom).lt("saved_at", eventTo),
        "saved recipes",
      ),
      fetchAll(
        () =>
          adminClient.from("palty_conversations").select(
            "id_user, last_message_at",
          ).gte("last_message_at", eventFrom).lt("last_message_at", eventTo),
        "conversations",
      ),
      fetchAll(
        () =>
          adminClient.from("meal_plans").select("id_user, created_at")
            .gte("created_at", eventFrom).lt("created_at", eventTo),
        "meal plans",
      ),
      fetchAll(
        () =>
          adminClient.from("recipe_tags").select("id_recipe, tags(name)")
            .gte("created_at", from).lt("created_at", to),
        "recipe tags",
      ),
      fetchAll(
        () =>
          adminClient.from("user_diet_styles").select(
            "user_id, diet_styles(name)",
          ),
        "diet styles",
      ),
      fetchAll(
        () =>
          adminClient.from("user_food_allergies").select(
            "user_id, food_allergies(name)",
          ),
        "allergies",
      ),
      fetchOptional(
        () =>
          adminClient.from("recipe_import_events").select(
            "id, id_user, platform, status, error_code, duration_ms, created_at",
          ).gte("created_at", eventFrom).lt("created_at", eventTo),
        "recipe import events",
      ),
    ]);

    const users = toAnalyticsUsers(userRows);
    const { valueEvents, activityEvents } = buildActivityEvents(
      recipes,
      saves,
      conversations,
      mealPlans,
      importEvents as ImportEventRow[],
    );
    const selectedRecipes = recipes.filter((row) =>
      inRange(row.created_at, range)
    );
    const previousRecipes = recipes.filter((row) =>
      inRange(row.created_at, previous)
    );
    const selectedSaves = saves.filter((row) => inRange(row.saved_at, range));
    const previousSaves = saves.filter((row) =>
      inRange(row.saved_at, previous)
    );
    const selectedActive = uniqueUsers(activityEvents, range);
    const previousActive = uniqueUsers(activityEvents, previous);
    const selectedNewUsers = usersRegisteredInRange(users, range);
    const previousNewUsers = usersRegisteredInRange(users, previous);

    const currentActivation = activation(selectedNewUsers, valueEvents, now);
    const previousActivation = activation(previousNewUsers, valueEvents, now);
    const retentionD1 = retention(selectedNewUsers, activityEvents, 1, now);
    const previousRetentionD1 = retention(
      previousNewUsers,
      activityEvents,
      1,
      now,
    );
    const retentionD7 = retention(selectedNewUsers, activityEvents, 7, now);
    const previousRetentionD7 = retention(
      previousNewUsers,
      activityEvents,
      7,
      now,
    );
    const retentionD30 = retention(selectedNewUsers, activityEvents, 30, now);
    const previousRetentionD30 = retention(
      previousNewUsers,
      activityEvents,
      30,
      now,
    );

    const weeklyRange = rangeEndingAt(now, 7);
    const previousWeeklyRange = rangeEndingAt(now, 7, 7);
    const dauRange = rangeEndingAt(now, 1);
    const previousDauRange = rangeEndingAt(now, 1, 1);
    const wauRange = rangeEndingAt(now, 7);
    const previousWauRange = rangeEndingAt(now, 7, 7);
    const mauRange = rangeEndingAt(now, 30);
    const previousMauRange = rangeEndingAt(now, 30, 30);
    const dau = uniqueUsers(activityEvents, dauRange).size;
    const previousDau = uniqueUsers(activityEvents, previousDauRange).size;
    const wau = uniqueUsers(activityEvents, wauRange).size;
    const previousWau = uniqueUsers(activityEvents, previousWauRange).size;
    const mau = uniqueUsers(activityEvents, mauRange).size;
    const previousMau = uniqueUsers(activityEvents, previousMauRange).size;

    const currentTimeToValue = timeToFirstValue(
      selectedNewUsers,
      valueEvents,
      now,
    );
    const previousTimeToValue = timeToFirstValue(
      previousNewUsers,
      valueEvents,
      now,
    );
    const currentMix = activeUserMix(users, activityEvents, range);
    const previousMix = activeUserMix(users, activityEvents, previous);

    const tagCounts = new Map<string, number>();
    selectedTags.forEach((row) => {
      const related = row.tags;
      const name = String(
        (Array.isArray(related) ? related[0]?.name : related?.name) ?? "",
      ).trim();
      if (name) tagCounts.set(name, (tagCounts.get(name) ?? 0) + 1);
    });
    const topTags = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, uses]) => ({ name, uses }));

    const saveCounts = new Map<number, number>();
    selectedSaves.forEach((row) => {
      const recipeId = Number(row.recipe_id);
      if (Number.isFinite(recipeId)) {
        saveCounts.set(recipeId, (saveCounts.get(recipeId) ?? 0) + 1);
      }
    });
    const topSaveEntries = [...saveCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    const topSaveIds = topSaveEntries.map(([recipeId]) => recipeId);
    let topSavedRecipes: { id_recipe: number; title: string; saves: number }[] =
      [];
    if (topSaveIds.length) {
      const { data: titles, error: titleError } = await adminClient
        .from("recipes")
        .select("id_recipe, title")
        .in("id_recipe", topSaveIds);
      if (titleError) throw titleError;
      const titleById = new Map(
        (titles ?? []).map((
          row,
        ) => [Number(row.id_recipe), row.title || "Receta"]),
      );
      topSavedRecipes = topSaveEntries.map(([id_recipe, savesCount]) => ({
        id_recipe,
        title: titleById.get(id_recipe) ?? "Receta",
        saves: savesCount,
      }));
    }

    const importTrackingSince = (importEvents as ImportEventRow[])
      .map((row) => row.created_at)
      .sort()[0] ?? null;
    const currentImportStats = importStats(
      importEvents as ImportEventRow[],
      recipes,
      range,
      now,
    );
    const previousImportStats = importStats(
      importEvents as ImportEventRow[],
      recipes,
      previous,
      now,
    );

    const countrySegments = countryMemberships(userRows);
    const dietSegments = segmentMemberships(currentDiets, "diet_styles");
    const allergySegments = segmentMemberships(
      currentAllergies,
      "food_allergies",
    );
    const sourceSegments = platformMemberships(
      recipes,
      importEvents as ImportEventRow[],
    );

    const legacy14Range: DateRange = {
      ...rangeEndingAt(now, 14),
      timezone: range.timezone,
      days: 14,
    };
    const legacyDailyRecipes = recipes.filter((row) =>
      inRange(row.created_at, legacy14Range)
    );

    return json(200, {
      now: now.toISOString(),
      range: {
        from,
        to_exclusive: to,
        timezone: range.timezone,
        days: range.days,
        previous_from: previous.from.toISOString(),
        previous_to_exclusive: previous.toExclusive.toISOString(),
      },
      active_users: selectedActive.size,
      new_users: selectedNewUsers.length,
      recipes_created: selectedRecipes.length,
      recipes_saved: selectedSaves.length,
      recipes_per_day: recipesPerDay(selectedRecipes, range),
      top_tags: topTags,
      top_source_authors: buildTopAuthors(selectedRecipes, selectedSaves),
      top_saved_recipes: topSavedRecipes,
      diets_distribution: distribution(currentDiets, "diet_styles"),
      allergies_distribution: distribution(currentAllergies, "food_allergies"),
      comparisons: {
        active_users: metricPoint(selectedActive.size, previousActive.size),
        new_users: metricPoint(
          selectedNewUsers.length,
          previousNewUsers.length,
        ),
        recipes_created: metricPoint(
          selectedRecipes.length,
          previousRecipes.length,
        ),
        recipes_saved: metricPoint(selectedSaves.length, previousSaves.length),
      },
      product_metrics: {
        weekly_value_users: metricPoint(
          uniqueUsers(valueEvents, weeklyRange).size,
          uniqueUsers(valueEvents, previousWeeklyRange).size,
        ),
        activation: compareCohortStats(currentActivation, previousActivation),
        retention: {
          d1: compareCohortStats(retentionD1, previousRetentionD1),
          d7: compareCohortStats(retentionD7, previousRetentionD7),
          d30: compareCohortStats(retentionD30, previousRetentionD30),
        },
        engagement: {
          dau: metricPoint(dau, previousDau),
          wau: metricPoint(wau, previousWau),
          mau: metricPoint(mau, previousMau),
          dau_mau_stickiness: metricPoint(
            percentage(dau, mau),
            percentage(previousDau, previousMau),
          ),
          wau_mau_stickiness: metricPoint(
            percentage(wau, mau),
            percentage(previousWau, previousMau),
          ),
        },
        user_mix: {
          new_users: metricPoint(currentMix.new_users, previousMix.new_users),
          returning_users: metricPoint(
            currentMix.returning_users,
            previousMix.returning_users,
          ),
        },
        time_to_first_value: {
          average_days: metricPoint(
            currentTimeToValue.average_days,
            previousTimeToValue.average_days,
          ),
          median_days: metricPoint(
            currentTimeToValue.median_days,
            previousTimeToValue.median_days,
          ),
          sample_size: currentTimeToValue.sample_size,
          eligible_users: currentTimeToValue.eligible_users,
        },
        per_active_user: {
          recipes: metricPoint(
            ratePerActiveUser(selectedRecipes.length, selectedActive.size),
            ratePerActiveUser(previousRecipes.length, previousActive.size),
          ),
          saves: metricPoint(
            ratePerActiveUser(selectedSaves.length, selectedActive.size),
            ratePerActiveUser(previousSaves.length, previousActive.size),
          ),
        },
        import_performance: {
          tracking_since: importTrackingSince,
          platforms: compareImportStats(
            currentImportStats,
            previousImportStats,
          ),
        },
      },
      segments: {
        countries: buildSegments(
          countrySegments,
          selectedNewUsers,
          previousNewUsers,
          valueEvents,
          activityEvents,
          now,
        ),
        diets: buildSegments(
          dietSegments,
          selectedNewUsers,
          previousNewUsers,
          valueEvents,
          activityEvents,
          now,
        ),
        allergies: buildSegments(
          allergySegments,
          selectedNewUsers,
          previousNewUsers,
          valueEvents,
          activityEvents,
          now,
        ),
        source_platforms: buildSegments(
          sourceSegments,
          selectedNewUsers,
          previousNewUsers,
          valueEvents,
          activityEvents,
          now,
        ),
      },

      // Compatibilidad con clientes anteriores del backoffice.
      dau,
      mau,
      new_users_7d: usersRegisteredInRange(users, rangeEndingAt(now, 7)).length,
      recipes_7d: recipes.filter((row) =>
        inRange(row.created_at, rangeEndingAt(now, 7))
      ).length,
      recipes_per_day_14: recipesPerDay(legacyDailyRecipes, legacy14Range)
        .map((item) => ({ day: item.day.slice(5), count: item.count })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "INVALID_DATE_RANGE") {
      return json(400, { error: "Rango de fechas inválido" });
    }
    if (message === "DATE_RANGE_TOO_LARGE") {
      return json(400, {
        error: `El rango máximo es de ${MAX_RANGE_DAYS} días`,
      });
    }
    if (message === "INVALID_TIMEZONE") {
      return json(400, { error: "Zona horaria inválida" });
    }
    console.error("admin-metrics fatal error", error);
    return json(500, { error: "Internal error" });
  }
});
