// src/lib/api.ts
import { EDGE_BASE, supabase } from './supabaseClient';
import { isDemoModeEnabled } from '../demoMode';
import { demoMetrics, demoRecipesList, demoUsersList } from './demoData';

export type MetricPoint = {
    value: number | null;
    previous: number | null;
    change_percent: number | null;
    comparison_available: boolean;
};

export type CohortMetric = MetricPoint & {
    numerator: number;
    denominator: number;
    low_sample: boolean;
    previous_numerator: number;
    previous_denominator: number;
};

export type PeriodComparison = {
    comparison_from: string;
    comparison_to_exclusive: string;
    new_users: MetricPoint;
    weekly_value_users: MetricPoint;
    recipes_created: MetricPoint;
    import_success_rate: MetricPoint;
};

export type ImportPlatformMetric = {
    platform: 'Instagram' | 'TikTok';
    attempts: number;
    resolved_attempts: number;
    low_sample: boolean;
    successes: number;
    failures: number;
    pending: number;
    success_rate: number | null;
    average_duration_seconds: number | null;
    median_duration_seconds: number | null;
    imported_recipes: number;
    mom: MetricPoint;
    yoy: MetricPoint;
};

type ImportTrendPoint = {
    period: string;
    instagram: number | null;
    tiktok: number | null;
    instagram_attempts: number;
    tiktok_attempts: number;
};

export type MetricResponse = {
    now: string;
    range: {
        from: string;
        to_exclusive: string;
        timezone: string;
        days: number;
    };
    active_users: number;
    new_users: number;
    weekly_value_users: number;
    recipes_created: number;
    recipes_saved: number;
    recipes_per_day: { day: string; count: number }[];
    recipe_activity_per_day: { day: string; created: number; saved: number }[];
    activation_7d: CohortMetric;
    retention: {
        d1: CohortMetric;
        d7: CohortMetric;
        d30: CohortMetric;
    };
    user_mix: {
        new_users: number;
        returning_users: number;
    };
    import_performance: {
        tracking_since: string | null;
        platforms: ImportPlatformMetric[];
    };
    comparisons: {
        mom: PeriodComparison;
        yoy: PeriodComparison;
    };
    trends: {
        active_users: {
            daily: { period: string; users: number }[];
            weekly: { period: string; users: number }[];
            monthly: { period: string; users: number }[];
        };
        import_success: {
            weekly: ImportTrendPoint[];
            monthly: ImportTrendPoint[];
        };
    };
    seasonality: {
        coverage_from: string;
        coverage_months: number;
        reliable: boolean;
        seasons: {
            season: string;
            period: string;
            recipes_created: number;
            recipes_saved: number;
            value_users: number;
            top_tag: string | null;
            complete: boolean;
        }[];
    };
    top_tags: { name: string; uses: number }[];
    top_source_authors: {
        username: string;
        platform: 'Instagram' | 'TikTok';
        recipes: number;
        saves: number;
    }[];
    top_saved_recipes: { id_recipe: number; title: string; saves: number }[];
    diets_distribution: { name: string; users: number }[];
    allergies_distribution: { name: string; users: number }[];
    data_quality: {
        min_reliable_sample: number;
        total_users: number;
        new_users_low_sample: boolean;
        users_with_diet: number;
        users_with_allergy: number;
        import_events_tracked: number;
        orphan_events_ignored: number;
    };
};

// helper para armar headers con el JWT actual
async function authHeaders(extra: Record<string, string> = {}) {
    const {
        data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
        throw new Error('No hay sesión activa');
    }

    return {
        Authorization: `Bearer ${session.access_token}`,
        ...extra,
    };
}

/* -------- METRICS -------- */

export async function apiMetrics(params?: {
    from?: string;
    to?: string;
    timezone?: string;
}): Promise<MetricResponse> {
    if (isDemoModeEnabled()) return demoMetrics(params);

    const query = new URLSearchParams();
    if (params?.from) query.set('from', params.from);
    if (params?.to) query.set('to', params.to);
    if (params?.timezone) query.set('timezone', params.timezone);

    const headers = await authHeaders();
    const suffix = query.size ? `?${query.toString()}` : '';
    const r = await fetch(`${EDGE_BASE}/admin-metrics${suffix}`, {
        method: 'GET',
        headers,
    });
    if (!r.ok) {
        const text = await r.text().catch(() => '');
        console.error('admin-metrics failed', r.status, text);
        throw new Error('metrics failed');
    }
    return r.json();
}

/* -------- USERS -------- */

export type UserSortKey = 'id_user' | 'name' | 'email' | 'country' | 'created_at' | 'enabled';
export type SortDirection = 'asc' | 'desc';

export async function apiUsersList(params: {
    q?: string;
    page?: number;
    pageSize?: number;
    sortBy?: UserSortKey;
    sortDirection?: SortDirection;
}) {
    if (isDemoModeEnabled()) return demoUsersList(params);

    const p = new URLSearchParams();
    if (params.q) p.set('q', params.q);
    if (params.page) p.set('page', String(params.page));
    if (params.pageSize) p.set('pageSize', String(params.pageSize));
    if (params.sortBy) p.set('sortBy', params.sortBy);
    if (params.sortDirection) p.set('sortDirection', params.sortDirection);

    const headers = await authHeaders();
    const r = await fetch(`${EDGE_BASE}/admin-users?${p.toString()}`, {
        method: 'GET',
        headers,
    });
    if (!r.ok) {
        const text = await r.text().catch(() => '');
        console.error('admin-users list failed', r.status, text);
        throw new Error('users failed');
    }
    return r.json();
}

export async function apiUserToggle(id_user: number, enabled: boolean) {
    if (isDemoModeEnabled()) throw new Error('El modo demo es de sólo lectura');

    const headers = await authHeaders({ 'Content-Type': 'application/json' });
    const r = await fetch(`${EDGE_BASE}/admin-users`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ id_user, enabled }),
    });
    if (!r.ok) {
        const response = await r.json().catch(() => null);
        console.error('admin-users toggle failed', r.status, response);
        throw new Error(response?.error || 'No se pudo actualizar el usuario');
    }
    return r.json();
}

/* -------- RECIPES -------- */

export async function apiRecipesList(params: { q?: string; page?: number; pageSize?: number }) {
    if (isDemoModeEnabled()) return demoRecipesList(params);

    const p = new URLSearchParams();
    if (params.q) p.set('q', params.q);
    if (params.page) p.set('page', String(params.page));
    if (params.pageSize) p.set('pageSize', String(params.pageSize));

    const headers = await authHeaders();
    const r = await fetch(`${EDGE_BASE}/admin-recipes?${p.toString()}`, {
        method: 'GET',
        headers,
    });
    if (!r.ok) {
        const text = await r.text().catch(() => '');
        console.error('admin-recipes list failed', r.status, text);
        throw new Error('recipes failed');
    }
    return r.json();
}

export async function apiRecipeUpdate(payload: any) {
    if (isDemoModeEnabled()) throw new Error('El modo demo es de sólo lectura');

    const headers = await authHeaders({ 'Content-Type': 'application/json' });
    const r = await fetch(`${EDGE_BASE}/admin-recipes`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
    });
    if (!r.ok) {
        const response = await r.json().catch(() => null);
        console.error('admin-recipes update failed', r.status, response);
        throw new Error(response?.error || 'No se pudo actualizar la receta');
    }
    return r.json();
}

export async function apiRecipeDelete(idRecipe: number) {
    if (isDemoModeEnabled()) throw new Error('El modo demo es de sólo lectura');
    if (!Number.isSafeInteger(idRecipe) || idRecipe <= 0) {
        throw new Error('El identificador de la receta no es válido');
    }

    const headers = await authHeaders();
    const params = new URLSearchParams({ id_recipe: String(idRecipe) });
    const r = await fetch(`${EDGE_BASE}/admin-recipes?${params.toString()}`, {
        method: 'DELETE',
        headers,
    });
    if (!r.ok) {
        const response = await r.json().catch(() => null);
        console.error('admin-recipes delete failed', r.status, response);
        throw new Error(response?.error || 'No se pudo eliminar la receta');
    }
    return r.json();
}

/* -------- REPORTS -------- */

export type LegacyReportId = 'usage' | 'recipes' | 'users';

export type ReportColumn = {
    key: string;
    label: string;
    description: string;
    type: 'date' | 'datetime' | 'number' | 'text' | 'boolean';
};

export type ReportPreview = {
    report: {
        id: LegacyReportId;
        title: string;
        generated_at: string;
        range: {
            from: string;
            to_exclusive: string;
            timezone: string;
            days: number;
        };
        row_count: number;
        preview_count: number;
    };
    data_quality: {
        min_reliable_sample: number;
        observations: number;
        low_sample: boolean;
        warnings: string[];
    };
    columns: ReportColumn[];
    rows: Array<Record<string, string | number | boolean | null>>;
};

export type ReportParams = {
    type: LegacyReportId;
    from: string;
    to: string;
    timezone: string;
};

function reportQuery(params: ReportParams, format: 'json' | 'csv') {
    const query = new URLSearchParams({
        type: params.type,
        from: params.from,
        to: params.to,
        timezone: params.timezone,
        format,
    });
    if (format === 'json') query.set('limit', '8');
    return query.toString();
}

export async function apiReportPreview(params: ReportParams): Promise<ReportPreview> {
    const headers = await authHeaders();
    const r = await fetch(`${EDGE_BASE}/admin-reports?${reportQuery(params, 'json')}`, {
        method: 'GET',
        headers,
    });
    if (!r.ok) {
        const text = await r.text().catch(() => '');
        console.error('admin-reports preview failed', r.status, text);
        throw new Error('report preview failed');
    }
    return r.json();
}

function filenameFromDisposition(value: string | null) {
    if (!value) return null;
    const encoded = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    if (encoded) return decodeURIComponent(encoded);
    return value.match(/filename="?([^";]+)"?/i)?.[1] ?? null;
}

export async function apiReportDownload(params: ReportParams) {
    const headers = await authHeaders();
    const r = await fetch(`${EDGE_BASE}/admin-reports?${reportQuery(params, 'csv')}`, {
        method: 'GET',
        headers,
    });
    if (!r.ok) {
        const text = await r.text().catch(() => '');
        console.error('admin-reports failed', r.status, text);
        throw new Error('report failed');
    }
    return {
        blob: await r.blob(),
        filename: filenameFromDisposition(r.headers.get('Content-Disposition'))
            ?? `foodloops-${params.type === 'usage' ? 'actividad-producto' : params.type === 'recipes' ? 'rendimiento-recetas' : 'actividad-usuarios'}.csv`,
    };
}
