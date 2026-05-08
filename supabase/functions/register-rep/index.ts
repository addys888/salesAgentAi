// ═══════════════════════════════════════════════════════════
//  DIALKARO — REGISTER REP (Turnstile-gated)
//  Supabase Edge Function
//
//  Flow:
//   1. Verify Cloudflare Turnstile token (skipped if TURNSTILE_SECRET unset
//      — lets you deploy this without breaking signup before CAPTCHA is wired)
//   2. Look up tenant by team_code (case-insensitive, must be active +
//      within subscription)
//   3. Active-only slot check (matches H1)
//   4. Create auth.users row via admin API with raw_app_meta_data.status='pending'
//   5. Create user_profiles row (status='pending', tenant_id=...)
//   6. Return success — rep waits for manager approval
//
//  Environment variables (set via supabase secrets set):
//    SUPABASE_URL                — auto-set by Supabase
//    SUPABASE_SERVICE_ROLE_KEY   — auto-set by Supabase
//    TURNSTILE_SECRET            — Cloudflare Turnstile secret key
//                                   (omit to disable CAPTCHA verification)
//
//  Deploy: supabase functions deploy register-rep
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface RegisterPayload {
  email?: string
  password?: string
  full_name?: string
  phone_number?: string
  team_code?: string
  turnstile_token?: string
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method not allowed' })

  let body: RegisterPayload
  try {
    body = await req.json()
  } catch {
    return jsonResponse(400, { error: 'invalid JSON body' })
  }

  // ── Field validation ──
  const email = (body.email || '').trim().toLowerCase()
  const password = body.password || ''
  const fullName = (body.full_name || '').trim()
  const phone = (body.phone_number || '').trim()
  const teamCode = (body.team_code || '').trim().toUpperCase()

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse(400, { error: 'Invalid email' })
  }
  if (password.length < 8) {
    return jsonResponse(400, { error: 'Password must be at least 8 characters' })
  }
  if (!fullName) return jsonResponse(400, { error: 'Full name required' })
  const phoneDigits = phone.replace(/^\+/, '')
  if (!phoneDigits || phoneDigits.length < 7 || phoneDigits.length > 15 || !/^\d+$/.test(phoneDigits)) {
    return jsonResponse(400, { error: 'Invalid phone (7-15 digits)' })
  }
  if (!teamCode) return jsonResponse(400, { error: 'Team Code required' })

  // ── 1. Turnstile verification ──
  const turnstileSecret = Deno.env.get('TURNSTILE_SECRET')
  if (turnstileSecret) {
    if (!body.turnstile_token) {
      return jsonResponse(400, { error: 'CAPTCHA required' })
    }
    const tsRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: turnstileSecret,
        response: body.turnstile_token,
        remoteip:
          req.headers.get('CF-Connecting-IP') ||
          req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
          '',
      }).toString(),
    })
    const tsData = await tsRes.json().catch(() => ({}))
    if (!tsData.success) {
      console.warn('[register-rep] Turnstile failed:', tsData)
      return jsonResponse(403, { error: 'CAPTCHA failed — please try again' })
    }
  } else {
    console.warn('[register-rep] TURNSTILE_SECRET unset — skipping CAPTCHA (insecure)')
  }

  // ── Initialize Supabase with service role ──
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── 2. Tenant lookup ──
  const { data: tenant, error: tenantErr } = await sb
    .from('tenants')
    .select('id, slug, app_name, max_reps, subscription_end, is_active')
    .eq('team_code', teamCode)
    .eq('is_active', true)
    .single()

  if (tenantErr || !tenant) {
    return jsonResponse(400, { error: 'Invalid Team Code. Please check with your manager.' })
  }

  // Subscription check
  if (tenant.subscription_end) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const subEnd = new Date(tenant.subscription_end)
    subEnd.setHours(0, 0, 0, 0)
    if (subEnd < today) {
      return jsonResponse(403, {
        error: "Your organisation's subscription has expired. Contact your administrator.",
      })
    }
  }

  // ── 3. Active-only slot check (H1) ──
  const { count, error: countErr } = await sb
    .from('user_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)
    .eq('status', 'active')

  if (countErr) {
    console.error('[register-rep] slot count error:', countErr)
    return jsonResponse(500, { error: 'Slot check failed — please retry' })
  }

  const maxReps = tenant.max_reps || 10
  if ((count || 0) >= maxReps) {
    return jsonResponse(403, {
      error: `Registration is closed — this team has reached its maximum of ${maxReps} active rep${maxReps === 1 ? '' : 's'}.`,
    })
  }

  // ── 4. Existing user? Check both user_profiles AND auth.users ──
  const { data: existingProfile } = await sb
    .from('user_profiles')
    .select('id, status, tenant_id')
    .eq('email', email)
    .maybeSingle()

  if (existingProfile) {
    if (existingProfile.status === 'rejected') {
      return jsonResponse(403, {
        error: 'Your previous registration was rejected. Please contact your manager.',
      })
    }
    return jsonResponse(409, { error: 'Email already registered. Please log in instead.' })
  }

  // ── 5. Create auth user (status='pending' in app_metadata) ──
  const { data: created, error: createErr } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone_number: phone },
    app_metadata: { status: 'pending', tenant_id: tenant.id },
  })

  if (createErr || !created.user) {
    console.error('[register-rep] createUser error:', createErr)
    const msg = (createErr?.message || '').toLowerCase()
    if (msg.includes('already') || msg.includes('unique') || msg.includes('duplicate')) {
      return jsonResponse(409, { error: 'Email already registered. Please log in instead.' })
    }
    return jsonResponse(500, { error: 'Could not create account — please try again' })
  }

  const userId = created.user.id

  // ── 6. Insert user_profiles row (upsert to handle orphan/retry scenarios) ──
  const { error: profileErr } = await sb.from('user_profiles').upsert({
    id: userId,
    full_name: fullName,
    email,
    phone_number: phone,
    status: 'pending',
    tenant_id: tenant.id,
  }, { onConflict: 'id' })

  if (profileErr) {
    console.error('[register-rep] user_profiles upsert error:', profileErr)
    // Roll back the auth user so the email isn't permanently taken
    await sb.auth.admin.deleteUser(userId).catch(() => {})

    const errMsg = profileErr.message || ''
    if (errMsg.includes('TENANT_FULL')) {
      return jsonResponse(403, {
        error: 'Registration just filled the last slot — please contact your manager.',
      })
    }
    return jsonResponse(500, { error: 'Could not save profile — please try again' })
  }

  console.log('[register-rep] OK — pending rep:', email, '→ tenant', tenant.slug)

  return jsonResponse(200, {
    ok: true,
    message: 'Account created — awaiting manager approval.',
    tenant: { slug: tenant.slug, app_name: tenant.app_name },
  })
})

// ═══════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════
function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
