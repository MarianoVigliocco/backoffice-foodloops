// src/lib/api.ts
import { EDGE_BASE, supabase } from './supabaseClient';

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
