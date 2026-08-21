// src/lib/api.ts
import { EDGE_BASE, supabase } from './supabaseClient';

export type MetricPoint = {
    value: number | null;
    previous: number | null;
    change_percent: number | null;
};

export type CohortMetricPoint = MetricPoint & {
    numerator: number;
    denominator: number;
    previous_numerator: number;
    previous_denominator: number;
};

export type SegmentMetric = {
    name: string;
    users: number;
    previous_users: number;
    activation: CohortMetricPoint;
    retention_d7: CohortMetricPoint;
    retention_d30: CohortMetricPoint;
};

export type ImportPlatformMetric = {
    platform: 'Instagram' | 'TikTok';
    attempts: number;
    successes: number;
    failures: number;
    pending: number;
    success_rate: number | null;
    average_duration_seconds: number | null;
    median_duration_seconds: number | null;
    imported_recipes: number;
    attempts_comparison: MetricPoint;
    successes_comparison: MetricPoint;
    failures_comparison: MetricPoint;
    success_rate_comparison: MetricPoint;
    duration_comparison: MetricPoint;
    imported_recipes_comparison: MetricPoint;
};

export type MetricResponse = {
    now: string;
    range: {
        from: string;
        to_exclusive: string;
        timezone: string;
        days: number;
        previous_from: string;
        previous_to_exclusive: string;
    };
    active_users: number;
    new_users: number;
    recipes_created: number;
    recipes_saved: number;
    recipes_per_day: { day: string; count: number }[];
    dau: number;
    mau: number;
    new_users_7d: number;
    recipes_7d: number;
    top_tags: { name: string; uses: number }[];
    top_source_authors: {
        username: string;
        platform: 'Instagram' | 'TikTok';
        recipes: number;
        saves: number;
    }[];
    top_saved_recipes: { id_recipe: number; title: string; saves: number }[];
    recipes_per_day_14: { day: string; count: number }[];
    diets_distribution: { name: string; users: number }[];
    allergies_distribution: { name: string; users: number }[];
    comparisons: {
        active_users: MetricPoint;
        new_users: MetricPoint;
        recipes_created: MetricPoint;
        recipes_saved: MetricPoint;
    };
    product_metrics: {
        weekly_value_users: MetricPoint;
        activation: CohortMetricPoint;
        retention: {
            d1: CohortMetricPoint;
            d7: CohortMetricPoint;
            d30: CohortMetricPoint;
        };
        engagement: {
            dau: MetricPoint;
            wau: MetricPoint;
            mau: MetricPoint;
            dau_mau_stickiness: MetricPoint;
            wau_mau_stickiness: MetricPoint;
        };
        user_mix: {
            new_users: MetricPoint;
            returning_users: MetricPoint;
        };
        time_to_first_value: {
            average_days: MetricPoint;
            median_days: MetricPoint;
            sample_size: number;
            eligible_users: number;
        };
        per_active_user: {
            recipes: MetricPoint;
            saves: MetricPoint;
        };
        import_performance: {
            tracking_since: string | null;
            platforms: ImportPlatformMetric[];
        };
    };
    segments: {
        countries: SegmentMetric[];
        diets: SegmentMetric[];
        allergies: SegmentMetric[];
        source_platforms: SegmentMetric[];
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
    const headers = await authHeaders({ 'Content-Type': 'application/json' });
    const r = await fetch(`${EDGE_BASE}/admin-recipes`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
    });
    if (!r.ok) {
        const text = await r.text().catch(() => '');
        console.error('admin-recipes update failed', r.status, text);
        throw new Error('recipe update failed');
    }
    return r.json();
}

/* -------- REPORTS -------- */

export async function apiReport(type: 'usage' | 'recipes' | 'users') {
    const headers = await authHeaders();
    const r = await fetch(`${EDGE_BASE}/admin-reports?type=${type}`, {
        method: 'GET',
        headers,
    });
    if (!r.ok) {
        const text = await r.text().catch(() => '');
        console.error('admin-reports failed', r.status, text);
        throw new Error('report failed');
    }
    return r.blob(); // CSV
}
