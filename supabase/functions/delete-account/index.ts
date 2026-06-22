// delete-account: permanently deletes the caller's own account.
//
// The client cannot delete an auth user (that needs the service role), so this
// runs server-side. The caller's JWT establishes WHO they are; we then delete
// exactly that user with the service role. Every owner/user table references
// auth.users(id) ON DELETE CASCADE, so removing the auth row erases all of the
// caller's data (profile, courses, mock tests, progress, saves) in one step.
//
// A user can only ever delete themselves: we delete userData.user.id, never an
// id from the request body. Idempotent — deleting an already-gone user is
// treated as success, so a retry after a dropped response still resolves.
//
// Secrets are the platform defaults injected into every Edge Function:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const authHeader = req.headers.get('Authorization')
  const authClient = createClient(
    url,
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: { headers: { Authorization: authHeader ?? '' } },
      auth: { persistSession: false },
    },
  )
  const { data: userData } = await authClient.auth.getUser()
  if (!userData?.user) return json({ error: 'You must be logged in.' }, 401)
  const userId = userData.user.id

  const admin = createClient(
    url,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  )

  const { error } = await admin.auth.admin.deleteUser(userId)
  // A "not found" on retry means a previous call already deleted us — success.
  if (error && !/not.*found/i.test(error.message)) {
    return json({ error: error.message }, 500)
  }

  return json({ deleted: true }, 200)
})
