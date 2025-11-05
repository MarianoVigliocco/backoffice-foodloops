import { EDGE_BASE } from './supabaseClient'
import { edgeFetch } from './edgeFetch.ts'

export type MetricResponse = {
    now: string;
    dau: number;
    mau: number;
    new_users_7d: number;
    recipes_7d: number;
    top_tags: { name: string; uses: number }[];
    top_saved_recipes: { id_recipe: number; title: string; saves: number }[];
    recipes_per_day_14: { day: string; count: number }[];
    diets_distribution: { name: string; users: number }[];
    allergies_distribution: { name: string; users: number }[];
};

export async function apiMetrics(): Promise<MetricResponse> {
    const r = await edgeFetch(`${EDGE_BASE}/admin-metrics`)
    return r.json()
}

export async function apiUsersList(params: { q?: string; page?: number; pageSize?: number }) {
    const p = new URLSearchParams()
    if (params.q) p.set('q', params.q)
    if (params.page) p.set('page', String(params.page))
    if (params.pageSize) p.set('pageSize', String(params.pageSize))
    const r = await edgeFetch(`${EDGE_BASE}/admin-users?${p.toString()}`)
    return r.json()
}

export async function apiUserToggle(id_user: number, enabled: boolean) {
    const r = await edgeFetch(`${EDGE_BASE}/admin-users`, {
        method: 'PATCH',
        body: JSON.stringify({ id_user, enabled }),
    })
    return r.json()
}

export async function apiRecipesList(params: { q?: string; page?: number; pageSize?: number }) {
    const p = new URLSearchParams()
    if (params.q) p.set('q', params.q)
    if (params.page) p.set('page', String(params.page))
    if (params.pageSize) p.set('pageSize', String(params.pageSize))
    const r = await edgeFetch(`${EDGE_BASE}/admin-recipes?${p.toString()}`)
    return r.json()
}

export async function apiRecipeUpdate(payload: any) {
    const r = await edgeFetch(`${EDGE_BASE}/admin-recipes`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
    })
    return r.json()
}

export async function apiReport(type: 'usage' | 'recipes' | 'users') {
    const r = await edgeFetch(`${EDGE_BASE}/admin-reports?type=${type}`, {
        // si tu función devuelve CSV, ayuda indicar Accept
        headers: { Accept: 'text/csv' },
    })
    return r.blob() // CSV
}
