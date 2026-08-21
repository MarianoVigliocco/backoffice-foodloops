// Import types for Supabase Edge Runtime (Deno)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * extract-recipe — borde de la API para la transcripción de recetas.
 *
 * Flujo: valida entrada -> scrapea el post (Apify IG / RapidAPI TT) -> sube
 * thumbnail -> arma contexto del usuario -> delega el análisis del video al
 * servicio de Cloud Run -> adapta la respuesta al modelo de datos del cliente.
 *
 * Contrato de respuesta (aditivo — `recipe`, `image`, `username` y `source`
 * conservan exactamente la forma histórica para no romper clientes existentes):
 *   {
 *     id, recipe, image, username, source,   // como siempre
 *     post_url,                              // nuevo
 *     recipe_flat                            // nuevo: listo para POST a save-recipe
 *   }
 */

/* ───── Config ───── */
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN");
const APIFY_IG_ACTOR_ID = Deno.env.get("APIFY_ACTOR_ID");
const CLOUD_RUN_FN_URL = Deno.env.get("CLOUD_RUN_FN_URL");
const CLOUD_RUN_API_KEY = Deno.env.get("CLOUD_RUN_API_KEY") || "";
const SUPABASE_PUBLIC_BUCKET = Deno.env.get("SUPABASE_PUBLIC_BUCKET") ??
  "images";

/* ───── Presupuesto de tiempo ─────
 * Las edge functions tienen un límite de wall-clock por request. La versión
 * anterior sumaba hasta ~195s en el peor caso y moría por timeout sin mensaje.
 * Estos números suman ~150s como techo real.
 */
/*
 * Techo duro para el scraping.
 *
 * El análisis del video (descarga + Gemini) mide ~50s y no se puede comprimir,
 * así que si Apify no terminó en ~60s la request ya no entra en el límite de la
 * plataforma. Antes esto se descubría recién a los 133s, haciendo esperar al
 * usuario para nada: mejor cortar temprano con un mensaje accionable.
 */
const T_APIFY_RUN = 55_000;
const T_APIFY_POLL = 8_000;
const T_APIFY_ITEMS = 12_000;
const T_THUMB = 8_000;
const T_THUMB_BUDGET = 20_000;
const T_CLOUD_RUN = 120_000;

/**
 * Presupuesto total de la request.
 *
 * Las edge functions cortan por wall-clock (~150s) con WORKER_RESOURCE_LIMIT,
 * un error opaco que el cliente no puede interpretar. Sumar timeouts por etapa
 * de forma independiente daba un peor caso muy por encima de ese techo, así que
 * cada etapa se recorta contra un deadline común.
 */
const T_TOTAL_BUDGET = 135_000;

function makeDeadline() {
  const end = Date.now() + T_TOTAL_BUDGET;
  return {
    /** Milisegundos restantes, nunca negativo. */
    remaining: () => Math.max(0, end - Date.now()),
    /** Timeout para una etapa, recortado a lo que queda menos un colchón. */
    budgetFor: (want: number, reserve = 0) =>
      Math.max(1000, Math.min(want, end - Date.now() - reserve)),
    expired: () => Date.now() >= end,
  };
}
type Deadline = ReturnType<typeof makeDeadline>;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* ───── Utils ───── */
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

/** Error con status HTTP explícito, para no clasificar por regex sobre el mensaje. */
class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code = "ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function stripSlashes(s: string) {
  return s.replace(/^\/+|\/+$/g, "");
}

/**
 * Normaliza lo que pega el usuario. El botón "Copiar enlace" de TikTok da
 * `https://vt.tiktok.com/XXXX/`, pero es habitual que llegue sin esquema, con
 * espacios, o envuelto en el shim de Instagram.
 */
function normalizeUrlInput(raw: unknown): URL | null {
  if (typeof raw !== "string") return null;
  let s = raw.trim();
  if (!s) return null;
  // Sin esquema -> asumimos https. Antes esto hacía fallar `new URL()` y la
  // request moría con "URL debe ser de Instagram o TikTok".
  if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(s)) s = "https://" + s;

  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;

  // Desenrollar el linkshim de Instagram (l.instagram.com/?u=...)
  if (u.hostname.toLowerCase() === "l.instagram.com") {
    const wrapped = u.searchParams.get("u");
    if (wrapped) {
      try {
        return new URL(decodeURIComponent(wrapped));
      } catch { /* nos quedamos con la original */ }
    }
  }
  return u;
}

/**
 * Coincidencia estricta de dominio: `includes("tiktok.com")` daba por buena a
 * `tiktok.com.evil.com`, y esa URL después se fetcheaba desde la función.
 */
function hostMatches(u: URL, domain: string) {
  const h = u.hostname.toLowerCase().replace(/\.$/, "");
  return h === domain || h.endsWith("." + domain);
}

const isTikTokUrl = (u: URL) => hostMatches(u, "tiktok.com");
const isInstagramUrl = (u: URL) => hostMatches(u, "instagram.com");

function extFromContentType(ct: string) {
  const base = (ct || "").split(";")[0].trim().toLowerCase();
  switch (base) {
    case "image/webp":
      return { ext: "webp", contentType: "image/webp" };
    case "image/png":
      return { ext: "png", contentType: "image/png" };
    case "image/jpeg":
    case "image/jpg":
      return { ext: "jpg", contentType: "image/jpeg" };
    default:
      return { ext: "jpg", contentType: "image/jpeg" };
  }
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  ms = 25000,
) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/* ───── IG URL normalizer ───── */
function parseInstagramUrl(u: URL) {
  const parts = stripSlashes(u.pathname).split("/");
  const kind = (parts[0] || "").toLowerCase();
  const shortcode = parts[1] || "";
  if (
    !["p", "reel", "tv"].includes(kind) || !/^[A-Za-z0-9_-]+$/.test(shortcode)
  ) {
    throw new HttpError(
      400,
      "Solo aceptamos posts o reels públicos de Instagram",
      "UNSUPPORTED_URL",
    );
  }

  const canonicalUrl = `https://www.instagram.com/p/${shortcode}`;
  return { canonicalUrl, kind, shortcode };
}

/* ───── Apify IG ───── */
async function runApifyInstagram(igCanonicalUrl: string, dl: Deadline) {
  const runUrl =
    `https://api.apify.com/v2/acts/${
      encodeURIComponent(APIFY_IG_ACTOR_ID!)
    }/runs` +
    `?token=${encodeURIComponent(APIFY_TOKEN!)}&waitForFinish=50`;

  const apifyInput = {
    addParentData: false,
    directUrls: [`${igCanonicalUrl}/?hl=es`],
    resultsType: "posts",
    resultsLimit: 1,
    isUserReelFeedURL: false,
    isUserTaggedFeedURL: false,
  };

  const runRes = await fetchWithTimeout(runUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(apifyInput),
    // Reservamos lo que necesita el análisis del video aguas abajo (~50s
    // medidos entre descarga y Gemini).
  }, dl.budgetFor(T_APIFY_RUN, 55_000));

  if (!runRes.ok) {
    throw new HttpError(502, `Apify IG run ${runRes.status}`, "SCRAPER_ERROR");
  }

  const run = await runRes.json();
  let status: string = run?.data?.status ?? run?.status;
  let datasetId: string = run?.data?.defaultDatasetId || run?.data?.datasetId ||
    run?.defaultDatasetId;
  const runId: string | undefined = run?.data?.id;

  // `waitForFinish` puede devolver el run todavía en READY (encolado) o RUNNING
  // sin que eso sea un error: del lado de Apify sigue avanzando. Antes esto se
  // trataba como fallo y se perdía un run que iba a terminar bien.
  // La reserva se calibra con lo medido aguas abajo (~45s entre descarga del
  // video y Gemini) más un colchón, no con una estimación al voleo.
  const pollUntil = Date.now() +
    Math.min(T_APIFY_POLL, dl.remaining() - 55_000);
  while (
    (status === "READY" || status === "RUNNING") && runId &&
    Date.now() < pollUntil
  ) {
    await new Promise((r) => setTimeout(r, 4000));
    try {
      const stRes = await fetchWithTimeout(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${
          encodeURIComponent(APIFY_TOKEN!)
        }`,
        {},
        10000,
      );
      if (!stRes.ok) continue;
      const st = await stRes.json();
      status = st?.data?.status ?? status;
      datasetId = st?.data?.defaultDatasetId || datasetId;
    } catch {
      // Un sondeo fallido no invalida el run: seguimos hasta el deadline.
    }
  }

  if (status !== "SUCCEEDED" || !datasetId) {
    const encolado = status === "READY" || status === "RUNNING";
    throw new HttpError(
      502,
      encolado
        ? "El scraper está demorando más de lo normal. Probá de nuevo en un minuto."
        : `El scraper no pudo leer el post (status: ${status || "?"})`,
      "SCRAPER_ERROR",
    );
  }

  const itemsUrl =
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${
      encodeURIComponent(APIFY_TOKEN!)
    }&clean=true&format=json&limit=1`;
  const itemsRes = await fetchWithTimeout(itemsUrl, {}, T_APIFY_ITEMS);
  if (!itemsRes.ok) {
    throw new HttpError(
      502,
      `Apify IG items ${itemsRes.status}`,
      "SCRAPER_ERROR",
    );
  }

  const items = await itemsRes.json();
  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpError(
      422,
      "No pudimos leer el post. ¿Es público?",
      "POST_NOT_ACCESSIBLE",
    );
  }

  const it = items[0];
  return {
    platform: "instagram" as const,
    videoUrl: it.videoUrl || it.video_url || null,
    caption: it.caption || it.title || null,
    creatorUsername: it.ownerUsername || it.username || null,
    thumbnailCandidates: [it.displayUrl, it.thumbnailUrl, it.thumbnail],
    referer: igCanonicalUrl,
    postUrl: igCanonicalUrl,
  };
}

/* ───── TikTok ───── */
/**
 * Resuelve autor y URL canónica de un link de TikTok.
 *
 * Los shortlinks (`vt.tiktok.com/XXXX`) rotan y caducan, así que guardarlos
 * como origen no sirve ni para trazabilidad ni para deduplicar. Seguimos el
 * redirect una sola vez y de ahí sacamos las dos cosas.
 */
async function resolveTikTok(ttUrl: string): Promise<{
  username: string | null;
  canonicalUrl: string;
  /** Portada sacada del HTML: sirve de respaldo cuando la de RapidAPI falla. */
  pageCover: string | null;
}> {
  const fromPath = (u: string) => {
    try {
      const segs = new URL(u).pathname.split("/").filter(Boolean);
      return segs[0]?.startsWith("@") && segs[0].length > 1
        ? segs[0].slice(1)
        : null;
    } catch {
      return null;
    }
  };

  try {
    const UA =
      "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36";
    const resp = await fetchWithTimeout(ttUrl, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": UA, "Accept": "text/html,*/*" },
    }, 12000);

    const finalUrl = resp?.url || ttUrl;
    const username = fromPath(finalUrl) ?? fromPath(ttUrl);

    // Aprovechamos el mismo HTML para sacar la portada de respaldo.
    let pageCover: string | null = null;
    try {
      const html = await resp.text();
      const m = html.match(/"cover":"([^"]+)"/) ??
        html.match(
          /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
        );
      if (m?.[1]) {
        pageCover = m[1].replace(/\\u002F/g, "/").replace(/\\\//g, "/");
      }
    } catch { /* la portada de respaldo es opcional */ }

    return {
      // Sólo damos por canónica una URL que se resolvió a /@user/video/.
      canonicalUrl: fromPath(finalUrl) ? stripTikTokQuery(finalUrl) : ttUrl,
      username,
      pageCover,
    };
  } catch {
    return { username: fromPath(ttUrl), canonicalUrl: ttUrl, pageCover: null };
  }
}

/** Quita los parámetros de tracking (`_r`, `_t`, …) que ensucian la URL. */
function stripTikTokQuery(u: string) {
  try {
    const url = new URL(u);
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return u;
  }
}

async function runRapidApiTikTok(ttUrl: string) {
  const RAPID_HOST = Deno.env.get("X-RAPIDAPI-HOST-TT");
  const RAPID_KEY = Deno.env.get("X-RAPIDAPI-KEY-TT");
  if (!RAPID_HOST || !RAPID_KEY) {
    throw new HttpError(
      500,
      "Servicio de TikTok mal configurado",
      "CONFIG_ERROR",
    );
  }

  // El host sale del secreto, igual que la cabecera. Tenerlo hardcodeado aca
  // hacia que cambiar de proveedor por configuracion no tuviera efecto: la
  // cabecera apuntaba al proveedor nuevo y la URL seguia yendo al viejo.
  const apiPath = Deno.env.get("X-RAPIDAPI-PATH-TT") ?? "/tiktok/video";
  const apiUrl = `https://${RAPID_HOST}${apiPath}?url=${
    encodeURIComponent(ttUrl)
  }&format=json`;

  const delaysMs = [600, 1400, 3000];
  let lastErr: unknown = null;

  for (let attempt = 0; attempt < delaysMs.length; attempt++) {
    try {
      const resp = await fetchWithTimeout(apiUrl, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "x-rapidapi-host": RAPID_HOST,
          "x-rapidapi-key": RAPID_KEY,
        },
      }, 35000);

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`RapidAPI ${resp.status}: ${body.slice(0, 200)}`);
      }

      const json = await resp.json().catch(() => ({}));
      // Cada proveedor de RapidAPI marca el exito distinto. Los basados en
      // tikwm (la familia mas comun, y la que usa el mapeo play/hdplay/wmplay
      // que ya leemos) responden `code: 0`, que la validacion anterior
      // rechazaba, impidiendo migrar de proveedor sin tocar codigo.
      const ok = json?.success === true ||
        json?.statusCode === 200 ||
        json?.code === 0;
      const data = json?.data ?? null;

      if (!ok || !data) {
        const msg = json?.error ?? `Respuesta sin 'data'`;
        const looksServerBug = json?.statusCode >= 500 ||
          /Cannot read properties/.test(String(msg));
        if (looksServerBug && attempt < delaysMs.length - 1) {
          await new Promise((r) =>
            setTimeout(r, delaysMs[attempt] + Math.random() * 250)
          );
          continue;
        }
        throw new Error(`RapidAPI: ${String(msg)}`);
      }

      let videoUrl = data.play || data.hdplay || data.wmplay || null;
      if (typeof videoUrl === "string") {
        try {
          videoUrl = new URL(videoUrl.replace(/([^:]\/)\/+/g, "$1")).toString();
        } catch { /* noop */ }
      }
      if (!videoUrl) {
        throw new HttpError(
          422,
          "El post de TikTok no tiene video",
          "NO_VIDEO",
        );
      }

      const { username, canonicalUrl, pageCover } = await resolveTikTok(ttUrl);
      return {
        platform: "tiktok" as const,
        videoUrl,
        caption: data.title || null,
        creatorUsername: username,
        // En orden de preferencia; el og:image de la página queda de respaldo
        // porque las portadas de RapidAPI 500-ean seguido.
        thumbnailCandidates: [
          data.cover,
          data.origin_cover,
          data.ai_dynamic_cover,
          pageCover,
        ],
        // El Referer va con la URL original: es la que el CDN espera.
        referer: ttUrl,
        postUrl: canonicalUrl,
      };
    } catch (e) {
      if (e instanceof HttpError) throw e;
      lastErr = e;
      if (attempt < delaysMs.length - 1) {
        await new Promise((r) =>
          setTimeout(r, delaysMs[attempt] + Math.random() * 250)
        );
        continue;
      }
      break;
    }
  }

  console.error("[tiktok] agotados los reintentos:", lastErr);

  // Un 5xx sostenido del proveedor no es "no pudimos leer TU video": es que el
  // servicio de terceros esta caido. Distinguirlo evita que el usuario crea que
  // su link esta mal y siga reintentando con links distintos.
  const msg = String((lastErr as Error)?.message ?? lastErr ?? "");
  if (/RapidAPI 5[0-9][0-9]/.test(msg)) {
    throw new HttpError(
      503,
      "El servicio de TikTok no esta disponible en este momento. Volve a intentar mas tarde.",
      "TIKTOK_PROVIDER_DOWN",
    );
  }
  throw new HttpError(
    502,
    "No pudimos leer el video de TikTok",
    "SCRAPER_ERROR",
  );
}

/* ───── Storage ───── */
let __bucketChecked = false;
async function ensureBucket(name: string, opts: { public: boolean }) {
  if (__bucketChecked) return;
  const { data: buckets, error: lbErr } = await supabase.storage.listBuckets();
  if (lbErr) {
    console.error("[listBuckets] error:", lbErr);
    return;
  }
  const exists = (buckets ?? []).some((b) => b.name === name);
  if (!exists) {
    const { error } = await supabase.storage.createBucket(name, {
      public: opts.public,
    });
    if (error) console.error("[createBucket] error:", error);
  }
  __bucketChecked = true;
}

async function uploadPublicThumbnailFromUrl(
  bucket: string,
  destPathBase: string,
  remoteUrls: (string | null | undefined)[],
  referer?: string,
): Promise<{ publicUrl: string | null; path: string | null; error?: string }> {
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (compatible; SupabaseEdge/1.0)",
    "Accept": "image/*,*/*",
    ...(referer ? { "Referer": referer } : {}),
  };

  let buf: Uint8Array | null = null;
  let ctypeHeader = "image/jpeg";
  let lastErr = "sin candidatos";

  // El CDN de TikTok devuelve 500 sobre la portada que da RapidAPI de forma
  // persistente por momentos, mientras que el og:image de la propia página del
  // video sí responde. Por eso se prueban varias URLs en orden en vez de
  // insistir sobre una sola, con un presupuesto acotado para no comerse el
  // tiempo que necesita el análisis del video.
  const until = Date.now() + T_THUMB_BUDGET;

  outer: for (
    const candidate of remoteUrls.filter((value): value is string =>
      typeof value === "string" && value.length > 0
    )
  ) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (Date.now() >= until) break outer;
      try {
        const resp = await fetchWithTimeout(
          candidate,
          { redirect: "follow", headers },
          T_THUMB,
        );
        if (!resp.ok) {
          const err = new Error(`fetch thumb ${resp.status}`);
          // Sólo 404/410 son definitivos para ESTA url; igual seguimos con la
          // siguiente candidata.
          (err as any).permanent = resp.status === 404 || resp.status === 410;
          throw err;
        }
        ctypeHeader = resp.headers.get("content-type") ?? "image/jpeg";
        buf = new Uint8Array(await resp.arrayBuffer());
        break outer;
      } catch (e) {
        lastErr = String((e as Error)?.message ?? e);
        if ((e as any)?.permanent === true) break; // pasar a la siguiente url
        await new Promise((r) => setTimeout(r, 500 + Math.random() * 400));
      }
    }
  }

  if (!buf) {
    console.error("[thumb-download] agotados los candidatos:", lastErr);
    return { publicUrl: null, path: null, error: `download: ${lastErr}` };
  }

  const { ext, contentType } = extFromContentType(ctypeHeader);
  const fullPath = destPathBase.endsWith(`.${ext}`)
    ? destPathBase
    : `${destPathBase}.${ext}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { error } = await supabase.storage.from(bucket).upload(
        fullPath,
        buf!,
        {
          contentType,
          upsert: true,
        },
      );
      if (error) throw error;
      const pub = supabase.storage.from(bucket).getPublicUrl(fullPath);
      return { publicUrl: pub?.data?.publicUrl ?? null, path: fullPath };
    } catch (e) {
      if (attempt === 2) {
        console.error("[thumb-upload] fallo:", e);
        return {
          publicUrl: null,
          path: null,
          error: `upload: ${String((e as Error)?.message ?? e)}`,
        };
      }
      await new Promise((r) =>
        setTimeout(r, 400 * (attempt + 1) + Math.random() * 300)
      );
    }
  }
  return { publicUrl: null, path: null, error: "upload: reintentos agotados" };
}

/* ───── Usuario ───── */
async function assertUserExists(idUser: number) {
  const { data, error } = await supabase
    .from("users")
    .select("id_user")
    .eq("id_user", idUser)
    .maybeSingle();
  if (error) {
    console.error("[users lookup] error:", error);
    throw new HttpError(500, "No pudimos validar el usuario", "DB_ERROR");
  }
  if (!data) throw new HttpError(404, "El usuario no existe", "USER_NOT_FOUND");
}

async function getUserContext(userId: number) {
  const empty = {
    country: null,
    dietStyles: [],
    allergies: [],
    ingredients_dislike: [],
  };
  try {
    const { data, error } = await supabase.rpc("get_user_context", {
      p_user_id: userId,
    });
    if (error) {
      console.error("[rpc get_user_context] error:", error);
      return empty;
    }
    return {
      country: data?.country ?? null,
      dietStyles: data?.diet_styles ?? [],
      allergies: data?.allergies ?? [],
      ingredients_dislike: data?.ingredients_dislike ?? [],
    };
  } catch (e) {
    console.error("[rpc get_user_context] ex:", e);
    return empty;
  }
}

type ImportPlatform = "Instagram" | "TikTok";

async function startImportAttempt(
  id: string,
  idUser: number,
  platform: ImportPlatform,
) {
  const { error } = await supabase.from("recipe_import_events").insert({
    id,
    id_user: idUser,
    platform,
    status: "started",
  });
  if (error) {
    console.error("[import-analytics] no se pudo iniciar el intento:", error);
    return false;
  }
  return true;
}

async function finishImportAttempt(
  id: string,
  status: "succeeded" | "failed",
  startedAt: number,
  errorCode?: string,
) {
  const { error } = await supabase.from("recipe_import_events").update({
    status,
    error_code: errorCode ?? null,
    duration_ms: Math.max(0, Date.now() - startedAt),
    completed_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) {
    console.error("[import-analytics] no se pudo cerrar el intento:", error);
  }
}

/* ───── Adaptador: schema de Gemini -> body de save-recipe ─────
 * Gemini y la tabla `recipes` usan nombres distintos (cook_time_mins vs
 * cook_time_min, recipe_steps vs steps, etc). Traducir acá y no en el cliente
 * mantiene el mapeo en un solo lugar.
 */
function toFlatRecipe(
  g: Record<string, any>,
  extras: {
    imageUrl: string | null;
    sourcePlatform: string;
    sourceUsername: string | null;
    postUrl: string;
  },
) {
  const num = (v: unknown) => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  return {
    title: g.title ?? null,
    description: g.description ?? null,
    servings_default: num(g.servings_default),
    prep_time_mins: num(g.prep_time_mins),
    cook_time_min: num(g.cook_time_mins),
    difficulty: g.recipe_difficulty ?? null,

    steps: Array.isArray(g.recipe_steps)
      ? g.recipe_steps.map((s: any, i: number) => ({
        step_number: num(s?.step_number) ?? i + 1,
        instruction: s?.instruction ?? "",
      }))
      : [],

    // `quantity` es el total de la receta: verificado contra los datos ya
    // guardados (4 porciones -> "4 filetes", "200 gramos").
    ingredients: Array.isArray(g.ingredients)
      ? g.ingredients.map((i: any) => ({
        name: i?.name ?? null,
        quantity: num(i?.quantity_total),
        unit: i?.unit_of_measure ?? null,
        ingredient_size: i?.ingredient_size ?? null,
      }))
      : [],

    categories: g.recipe_category ? [g.recipe_category] : [],
    tags: Array.isArray(g.tags)
      ? g.tags.map((t: any) => (typeof t === "string" ? t : t?.name)).filter(
        Boolean,
      )
      : [],

    calories_per_serving_kcal: num(g.calories_per_serving_kcal),
    protein_per_serving_g: num(g.protein_per_serving_g),
    carbs_per_serving_g: num(g.carbs_per_serving_g),
    fats_per_serving_g: num(g.fats_per_serving_g),
    fiber_per_serving_g: num(g.fiber_per_serving_g),
    sugar_per_serving_g: num(g.sugar_per_serving_g),
    sodium_per_serving_mg: num(g.sodium_per_serving_mg),
    notes_on_assumptions: g.notes_on_assumptions ?? null,

    image_url: extras.imageUrl,
    source_platform: extras.sourcePlatform,
    source_username: extras.sourceUsername,
    video_source_url: extras.postUrl,
  };
}

/* ───── Handler ───── */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const id = crypto.randomUUID();
  const requestStartedAt = Date.now();
  let importTracked = false;
  // Si algo falla después de subir el thumbnail hay que borrarlo: si no, cada
  // error deja un huérfano en el bucket público (había 165 acumulados).
  let thumbPath: string | null = null;
  // Fallos parciales que no justifican tirar abajo la request.
  const warnings: string[] = [];
  const dl = makeDeadline();

  try {
    if (req.method !== "POST") {
      throw new HttpError(405, "Método no soportado", "METHOD_NOT_ALLOWED");
    }
    if (!APIFY_TOKEN || !APIFY_IG_ACTOR_ID || !CLOUD_RUN_FN_URL) {
      console.error("[config] faltan variables de entorno");
      throw new HttpError(500, "Servicio mal configurado", "CONFIG_ERROR");
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      throw new HttpError(
        400,
        "El cuerpo debe ser JSON válido",
        "INVALID_BODY",
      );
    }

    const { url } = body ?? {};
    // Aceptamos el id como número o como string numérico: el cliente mandaba
    // "33" y recibía un 500 confuso.
    const idUserRaw = body?.id_user;
    const id_user = typeof idUserRaw === "number"
      ? idUserRaw
      : Number.isInteger(Number(idUserRaw)) && String(idUserRaw).trim() !== ""
      ? Number(idUserRaw)
      : NaN;

    if (!url || typeof url !== "string") {
      throw new HttpError(400, "Falta url", "MISSING_URL");
    }
    if (!Number.isInteger(id_user)) {
      throw new HttpError(400, "Falta id_user (entero)", "MISSING_USER");
    }

    const parsedUrl = normalizeUrlInput(url);
    if (!parsedUrl || (!isInstagramUrl(parsedUrl) && !isTikTokUrl(parsedUrl))) {
      throw new HttpError(
        400,
        "URL debe ser de Instagram o TikTok",
        "UNSUPPORTED_URL",
      );
    }

    const importPlatform: ImportPlatform = isInstagramUrl(parsedUrl)
      ? "Instagram"
      : "TikTok";

    // Validar el usuario ANTES de scrapear: un id inexistente gastaba un run de
    // Apify completo antes de que nadie se diera cuenta.
    await assertUserExists(id_user);
    importTracked = await startImportAttempt(id, id_user, importPlatform);

    await ensureBucket(SUPABASE_PUBLIC_BUCKET, { public: true });

    // 1) Scrape
    const meta = isInstagramUrl(parsedUrl)
      ? await runApifyInstagram(parseInstagramUrl(parsedUrl).canonicalUrl, dl)
      : await runRapidApiTikTok(parsedUrl.toString());

    if (!meta?.videoUrl) {
      throw new HttpError(
        422,
        "El post no contiene un video (¿es una foto?)",
        "NO_VIDEO",
      );
    }

    // 2) Thumbnail — su fallo NO aborta la extracción (la receta sirve igual
    // sin foto), pero tiene que quedar visible en vez de degradarse en silencio.
    let imageObj: { url: string | null } | null = null;
    const candidates = (meta.thumbnailCandidates ?? []).filter(
      Boolean,
    ) as string[];
    if (candidates.length) {
      const uploaded = await uploadPublicThumbnailFromUrl(
        SUPABASE_PUBLIC_BUCKET,
        `thumbnails/${meta.platform}/${id}`,
        candidates,
        meta.referer,
      );
      thumbPath = uploaded.path;
      imageObj = { url: uploaded.publicUrl };
      if (!uploaded.publicUrl) {
        warnings.push(`thumbnail_failed: ${uploaded.error ?? "desconocido"}`);
        console.error(
          "[thumb] candidatas:",
          candidates.length,
          "->",
          uploaded.error,
        );
      }
    } else {
      warnings.push("thumbnail_missing: el scraper no devolvió portada");
    }

    // 3) Contexto del usuario
    const ctx = await getUserContext(id_user);

    // 4) Cloud Run
    const crRes = await fetchWithTimeout(CLOUD_RUN_FN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(CLOUD_RUN_API_KEY ? { "x-api-key": CLOUD_RUN_API_KEY } : {}),
      },
      body: JSON.stringify({
        videoUrl: meta.videoUrl,
        caption: meta.caption,
        dietStyles: ctx.dietStyles,
        allergies: ctx.allergies,
        country: ctx.country,
        ingredients_dislike: ctx.ingredients_dislike,
        source: meta.platform,
        referer: meta.referer,
      }),
      // Lo que quede del presupuesto, para devolver un error propio antes de
      // que la plataforma corte con WORKER_RESOURCE_LIMIT.
    }, dl.budgetFor(T_CLOUD_RUN, 3000));

    const text = await crRes.text();
    let crJson: any = null;
    try {
      crJson = text ? JSON.parse(text) : null;
    } catch {
      crJson = null;
    }

    if (!crRes.ok || !crJson?.ok) {
      // El servicio de análisis distingue sus fallos con `code`; los que son
      // culpa del contenido se propagan como 422 y no como 500.
      const code = crJson?.code;
      if (code === "NOT_A_RECIPE") {
        throw new HttpError(
          422,
          "El video no es una receta de cocina.",
          "NOT_A_RECIPE",
        );
      }
      if (code === "RESPONSE_TRUNCATED") {
        throw new HttpError(
          422,
          "La receta es demasiado larga para procesarla completa.",
          "RESPONSE_TRUNCATED",
        );
      }
      console.error("[cloud-run] fallo", crRes.status, text.slice(0, 500));
      throw new HttpError(
        502,
        "No pudimos analizar el video. Probá de nuevo en unos minutos.",
        "ANALYZER_ERROR",
      );
    }

    const gemini = crJson?.recipe?.recipes;
    if (!gemini || gemini.recipe === false) {
      throw new HttpError(
        422,
        "El video no es una receta de cocina.",
        "NOT_A_RECIPE",
      );
    }

    // 5) Respuesta
    if (importTracked) {
      await finishImportAttempt(id, "succeeded", requestStartedAt);
    }

    return jsonResponse({
      id,
      recipe: crJson.recipe,
      image: imageObj,
      username: meta.creatorUsername ?? null,
      source: meta.platform === "tiktok" ? "Tik Tok" : "Instagram",
      post_url: meta.postUrl,
      recipe_flat: toFlatRecipe(gemini, {
        imageUrl: imageObj?.url ?? null,
        sourcePlatform: meta.platform === "tiktok" ? "Tik Tok" : "Instagram",
        sourceUsername: meta.creatorUsername ?? null,
        postUrl: meta.postUrl,
      }),
      ...(warnings.length ? { warnings } : {}),
    }, 200);
  } catch (e) {
    // Limpiar el thumbnail huérfano del intento fallido.
    if (thumbPath) {
      try {
        await supabase.storage.from(SUPABASE_PUBLIC_BUCKET).remove([thumbPath]);
      } catch (rmErr) {
        console.error("[thumb-cleanup] no se pudo borrar:", rmErr);
      }
    }

    if (importTracked) {
      const errorCode = e instanceof HttpError
        ? e.code
        : (e as Error)?.name === "AbortError"
        ? "TIMEOUT"
        : "INTERNAL";
      await finishImportAttempt(id, "failed", requestStartedAt, errorCode);
    }

    if (e instanceof HttpError) {
      console.error(`[edge-error] ${e.code}: ${e.message}`);
      return jsonResponse({ error: e.message, code: e.code }, e.status);
    }

    // Un timeout de cualquier etapa llega acá como AbortError. Antes se
    // enmascaraba como "Error inesperado" y era indistinguible de un bug.
    if ((e as Error)?.name === "AbortError") {
      console.error("[edge-error] timeout de etapa:", e);
      return jsonResponse({
        error: "La extracción tardó demasiado. Probá de nuevo en un minuto.",
        code: "TIMEOUT",
      }, 504);
    }

    // Nada de detalles internos al cliente; el stack va sólo a los logs.
    console.error(
      "[edge-error] inesperado:",
      e,
      "\nSTACK:",
      (e as Error)?.stack,
    );
    return jsonResponse(
      { error: "Error inesperado procesando el video", code: "INTERNAL" },
      500,
    );
  }
});
