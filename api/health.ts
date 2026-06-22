// GET /health — liveness probe for the uptime monitor (.github/workflows/uptime.yml).
// A Vite SPA has no server routes, so /health is a Vercel Edge Function reached through the
// vercel.json rewrite. It makes one round-trip to Supabase Auth (no app tables) and returns
// the plain text "ok" the monitor greps for — proving the deployed app can reach its database.
// It reads the same public Production env the browser client does (two-prefix fallback); no
// secret is involved.

declare const process: { env: Record<string, string | undefined> }

export const config = { runtime: 'edge' }

export default async function handler(): Promise<Response> {
  const url =
    process.env.VITE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    return new Response('missing supabase config', { status: 503 })
  }
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key },
    })
    if (!res.ok) return new Response('supabase unreachable', { status: 503 })
  } catch {
    return new Response('supabase unreachable', { status: 503 })
  }
  return new Response('ok', {
    status: 200,
    headers: { 'content-type': 'text/plain' },
  })
}
