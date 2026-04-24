// ═══════════════════════════════════════════════════════════
//  DIALKARO — WEBHOOK LEADS RECEIVER
//  Supabase Edge Function
//
//  Receives leads from:
//  - Generic web forms (POST with webhook secret)
//  - Zapier/Pabbly (POST with webhook secret)
//  - Facebook Lead Ads (POST with Meta signature — Phase 2)
//
//  Deploy: supabase functions deploy webhook-leads
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

// CORS headers for browser-based form submissions
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── Get tenant slug from query params ──
    const url = new URL(req.url)
    const tenantSlug = url.searchParams.get('tenant')

    if (!tenantSlug) {
      return jsonResponse(400, { error: 'Missing ?tenant=SLUG parameter' })
    }

    // ── Initialize Supabase with service_role key (bypasses RLS) ──
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const sb = createClient(supabaseUrl, supabaseServiceKey)

    // ── Look up tenant ──
    const { data: tenant, error: tenantErr } = await sb
      .from('tenants')
      .select('id, slug, webhook_secret, app_name')
      .eq('slug', tenantSlug)
      .single()

    if (tenantErr || !tenant) {
      return jsonResponse(404, { error: 'Tenant not found: ' + tenantSlug })
    }

    // ── GET = Facebook webhook verification (Phase 2 future-ready) ──
    if (req.method === 'GET') {
      const mode = url.searchParams.get('hub.mode')
      const token = url.searchParams.get('hub.verify_token')
      const challenge = url.searchParams.get('hub.challenge')

      if (mode === 'subscribe' && token === tenant.webhook_secret) {
        console.log('[webhook] Facebook verification OK for tenant:', tenantSlug)
        return new Response(challenge, { status: 200, headers: corsHeaders })
      }
      return jsonResponse(403, { error: 'Verification failed' })
    }

    // ── POST = Receive lead data ──
    if (req.method === 'POST') {
      const body = await req.json()

      // ── Determine source and extract lead data ──
      let lead: LeadData

      // Check if this is a Facebook Lead Ad payload
      if (body.entry && body.entry[0]?.changes) {
        lead = parseFacebookLead(body)
        lead.source = 'facebook'
      }
      // Generic web form / Zapier / API
      else {
        // Verify webhook secret
        const secret = body.secret || req.headers.get('x-webhook-secret') || ''
        if (secret !== tenant.webhook_secret) {
          return jsonResponse(401, { error: 'Invalid webhook secret' })
        }
        lead = parseGenericLead(body)
      }

      // ── Validate: phone is required ──
      if (!lead.phone) {
        return jsonResponse(400, { error: 'Missing phone number' })
      }

      // ── Normalize phone number ──
      lead.phone = normalizePhone(lead.phone)
      if (!lead.phone) {
        return jsonResponse(400, { error: 'Invalid phone number' })
      }

      // ── Round-robin: assign to rep with fewest leads ──
      const assignedTo = await getNextRep(sb, tenant.id)

      // ── Insert lead (upsert to handle duplicates) ──
      const { data: inserted, error: insertErr } = await sb
        .from('leads')
        .upsert({
          tenant_id: tenant.id,
          assigned_to: assignedTo,
          full_name: lead.name || null,
          phone: lead.phone,
          email: lead.email || null,
          source: lead.source || 'website',
          source_detail: lead.source_detail || null,
          interest: lead.interest || null,
          raw_data: body,
          status: 'new',
        }, {
          onConflict: 'tenant_id,phone',
          ignoreDuplicates: true,  // Don't overwrite existing leads
        })

      if (insertErr) {
        console.error('[webhook] Insert error:', insertErr)
        // Duplicate phone = not an error, just means lead already exists
        if (insertErr.code === '23505') {
          return jsonResponse(200, {
            status: 'duplicate',
            message: 'Lead with this phone already exists',
            phone: lead.phone,
          })
        }
        return jsonResponse(500, { error: 'Failed to save lead: ' + insertErr.message })
      }

      console.log('[webhook] Lead captured for', tenantSlug, ':', lead.phone, 'source:', lead.source)

      return jsonResponse(200, {
        status: 'ok',
        message: 'Lead captured successfully',
        lead: {
          phone: lead.phone,
          name: lead.name,
          source: lead.source,
          assigned_to: assignedTo || 'unassigned',
        }
      })
    }

    return jsonResponse(405, { error: 'Method not allowed' })

  } catch (err) {
    console.error('[webhook] Fatal error:', err)
    return jsonResponse(500, { error: 'Internal server error' })
  }
})

// ═══════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════
interface LeadData {
  name?: string
  phone: string
  email?: string
  source: string
  source_detail?: string
  interest?: string
}

// ═══════════════════════════════════════════════════════════
//  PARSERS
// ═══════════════════════════════════════════════════════════

// Parse a generic web form / Zapier / API payload
function parseGenericLead(body: any): LeadData {
  return {
    name: body.name || body.full_name || body.Name || body.customer_name || '',
    phone: body.phone || body.phone_number || body.mobile || body.Phone || body.contact || '',
    email: body.email || body.Email || body.email_address || '',
    source: body.source || 'website',
    source_detail: body.source_detail || body.campaign || body.form_name || body.utm_source || '',
    interest: body.interest || body.product || body.message || body.requirement || '',
  }
}

// Parse Facebook Lead Ad webhook payload
function parseFacebookLead(body: any): LeadData {
  const lead: LeadData = { phone: '', source: 'facebook' }
  try {
    const entry = body.entry?.[0]
    const change = entry?.changes?.[0]
    const value = change?.value

    if (value?.field_data) {
      // Direct field_data (when using leadgen webhook)
      value.field_data.forEach((field: any) => {
        const val = field.values?.[0] || ''
        const key = (field.name || '').toLowerCase()
        if (key.includes('name') || key === 'full_name') lead.name = val
        else if (key.includes('phone') || key.includes('mobile') || key === 'phone_number') lead.phone = val
        else if (key.includes('email')) lead.email = val
        else if (!lead.interest && val) lead.interest = `${field.name}: ${val}`
      })
    }

    lead.source_detail = value?.form_id ? `Form: ${value.form_id}` : ''
  } catch (e) {
    console.error('[webhook] Facebook parse error:', e)
  }
  return lead
}

// ═══════════════════════════════════════════════════════════
//  PHONE NORMALIZATION
// ═══════════════════════════════════════════════════════════
function normalizePhone(raw: string): string {
  // Strip everything except digits
  let n = raw.replace(/[^\d]/g, '')

  // Indian number: +91XXXXXXXXXX or 91XXXXXXXXXX → XXXXXXXXXX
  if (n.startsWith('91') && n.length === 12) {
    n = n.slice(2)
  }
  // Leading 0: 0XXXXXXXXXX → XXXXXXXXXX
  if (n.startsWith('0') && n.length === 11) {
    n = n.slice(1)
  }
  // Valid 10-digit Indian mobile
  if (n.length === 10 && /^[6-9]/.test(n)) {
    return n
  }
  // International: 7-15 digits (keep as-is)
  if (n.length >= 7 && n.length <= 15) {
    return n
  }

  return '' // Invalid
}

// ═══════════════════════════════════════════════════════════
//  ROUND-ROBIN ASSIGNMENT
// ═══════════════════════════════════════════════════════════
async function getNextRep(sb: any, tenantId: string): Promise<string | null> {
  try {
    // Get all active reps for this tenant
    const { data: reps } = await sb
      .from('user_profiles')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')

    if (!reps || reps.length === 0) return null

    // Count existing leads per rep (only 'new' status — already called leads don't count)
    const { data: counts } = await sb
      .from('leads')
      .select('assigned_to')
      .eq('tenant_id', tenantId)
      .eq('status', 'new')

    const countMap: Record<string, number> = {}
    reps.forEach((r: any) => { countMap[r.id] = 0 })
    ;(counts || []).forEach((l: any) => {
      if (l.assigned_to && countMap[l.assigned_to] !== undefined) {
        countMap[l.assigned_to]++
      }
    })

    // Find rep with fewest new leads
    let minRep = reps[0].id
    let minCount = countMap[minRep] ?? Infinity
    for (const rep of reps) {
      if ((countMap[rep.id] ?? 0) < minCount) {
        minRep = rep.id
        minCount = countMap[rep.id] ?? 0
      }
    }

    return minRep
  } catch (e) {
    console.error('[webhook] Assignment error:', e)
    return null
  }
}

// ═══════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════
function jsonResponse(status: number, body: any) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
