import { getAccessToken } from './supabaseClient'

type EdgeFetchInit = RequestInit & { authRequired?: boolean }

export async function edgeFetch(url: string, init: EdgeFetchInit = {}) {
  const headers = new Headers(init.headers || {})
  // JSON por defecto cuando hay body
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (init.authRequired !== false) {
    const token = await getAccessToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }

  // opcional pero útil para Supabase:
  if (!headers.has('apikey')) {
    // En frontend, podés omitir este header. Si querés, añade ANON key como apikey:
    // headers.set('apikey', import.meta.env.VITE_SUPABASE_ANON_KEY as string)
  }

  const res = await fetch(url, { ...init, headers })
  if (!res.ok) {
    let msg = 'Request failed'
    try { msg = (await res.json()).error ?? msg } catch {}
    throw new Error(msg)
  }
  return res
}
