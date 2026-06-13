// complete-lesson: records that a user finished a lesson and, if they got every
// question right, awards the lesson's credit prize exactly once.
//
// Why this runs with the SERVICE ROLE (unlike generate-course, which uses the
// caller's JWT): credits are spendable currency, so the balance is column-locked
// against direct client writes. The only trustworthy way to award is to re-grade
// the lesson here, server-side, against the stored answer keys — never trusting a
// client-reported score — and then move credits through the service role. The
// caller's own JWT still establishes WHO they are; the service role only does the
// privileged re-grade + award. Idempotency lives in award_lesson_credit's CAS on
// node_progress.credited, so a replay pays nothing.
//
// Secrets are the platform defaults injected into every Edge Function:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { isExactlyCorrect } from '../_shared/grade.ts'
import type { GradableQuestion, SubmittedAnswer } from '../_shared/grade.ts'

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

interface Submission {
  questionId: string
  answer: SubmittedAnswer
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const authHeader = req.headers.get('Authorization')
  const authClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader ?? '' } },
    auth: { persistSession: false },
  })
  const { data: userData } = await authClient.auth.getUser()
  if (!userData?.user) return json({ error: 'You must be logged in.' }, 401)
  const userId = userData.user.id

  const body = await req.json().catch(() => ({}))
  const nodeId = (body as { nodeId?: unknown }).nodeId
  if (typeof nodeId !== 'string' || nodeId === '') {
    return json({ error: 'nodeId is required.' }, 400)
  }
  const rawResponses = (body as { responses?: unknown }).responses
  // Cap before iterating — the array is client-supplied; a lesson has ≤50
  // questions, so anything beyond that is noise we won't match anyway.
  const submissions: Submission[] = (
    Array.isArray(rawResponses) ? (rawResponses as Submission[]) : []
  )
    .slice(0, 100)
    .filter(
      (item) =>
        item &&
        typeof item.questionId === 'string' &&
        item.answer != null &&
        typeof item.answer === 'object',
    )

  const admin = createClient(
    url,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  )

  // Load the lesson and confirm the caller may study its course (their own, or
  // a public one). The service role bypasses RLS, so this check is explicit.
  const { data: node, error: nodeError } = await admin
    .from('nodes')
    .select('id, course_id, credit_prize')
    .eq('id', nodeId)
    .maybeSingle()
  if (nodeError) return json({ error: nodeError.message }, 500)
  if (!node) return json({ error: 'Lesson not found.' }, 404)

  const { data: course } = await admin
    .from('courses')
    .select('owner_id, visibility')
    .eq('id', node.course_id)
    .maybeSingle()
  if (!course || (course.visibility !== 'public' && course.owner_id !== userId)) {
    return json({ error: 'Lesson not found.' }, 404)
  }

  const { data: questionRows, error: questionsError } = await admin
    .from('questions')
    .select('id, kind, options, answer, calc')
    .eq('node_id', nodeId)
    .order('position', { ascending: true })
    .limit(50)
  if (questionsError) return json({ error: questionsError.message }, 500)
  const questions = (questionRows ?? []) as Array<
    GradableQuestion & { id: string }
  >

  // Completion is recorded regardless of score (idempotent upsert).
  const { error: completeError } = await admin
    .from('node_progress')
    .upsert(
      { user_id: userId, node_id: nodeId },
      { onConflict: 'user_id,node_id', ignoreDuplicates: true },
    )
  if (completeError) return json({ error: completeError.message }, 500)

  // Re-grade strictly: every question must have a correct submitted answer.
  const answers = new Map<string, SubmittedAnswer>()
  for (const item of submissions) answers.set(item.questionId, item.answer)
  const flawless =
    questions.length > 0 &&
    questions.every((question) => {
      const answer = answers.get(question.id)
      return answer !== undefined && isExactlyCorrect(question, answer)
    })

  let creditAwarded = 0
  if (flawless) {
    const { data: awarded, error: awardError } = await admin.rpc(
      'award_lesson_credit',
      { p_node_id: nodeId, p_user: userId },
    )
    if (awardError) return json({ error: awardError.message }, 500)
    creditAwarded = typeof awarded === 'number' ? awarded : 0
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('credits')
    .eq('user_id', userId)
    .maybeSingle()

  return json(
    {
      completed: true,
      flawless,
      creditAwarded,
      balance: profile?.credits ?? 0,
    },
    200,
  )
})
