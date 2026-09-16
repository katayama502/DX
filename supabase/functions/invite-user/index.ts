// Edge Function: 団体管理者（または運営）がスタッフを招待する。
// 呼び出し側の JWT を検証 → 権限・上限をチェック → invitations に記録 → auth.admin.inviteUserByEmail
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const auth = req.headers.get('Authorization') ?? ''
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const caller = createClient(url, anon, { global: { headers: { Authorization: auth } } })
    const { data: { user } } = await caller.auth.getUser()
    if (!user) return json({ error: 'unauthorized' }, 401)

    const body = await req.json().catch(() => ({}))
    const email = String(body.email ?? '').trim().toLowerCase()
    const role = body.role === 'org_admin' ? 'org_admin' : 'staff'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json({ error: 'メールアドレスの形式が正しくありません' }, 400)

    const admin = createClient(url, service, { auth: { persistSession: false } })
    const { data: me } = await admin.from('profiles').select('org_code, role, status').eq('id', user.id).single()
    if (!me || me.status !== 'active') return json({ error: 'forbidden' }, 403)
    const orgCode = me.role === 'ops_admin' && body.org_code ? String(body.org_code) : me.org_code
    if (me.role !== 'ops_admin' && me.role !== 'org_admin') return json({ error: 'forbidden' }, 403)

    const { data: org } = await admin.from('organizations').select('seat_limit, status').eq('code', orgCode).single()
    if (!org || !['trial', 'active'].includes(org.status)) return json({ error: '契約中の団体ではありません' }, 400)
    const { count: active } = await admin.from('profiles').select('*', { count: 'exact', head: true }).eq('org_code', orgCode).neq('status', 'disabled')
    const { count: pending } = await admin.from('invitations').select('*', { count: 'exact', head: true }).eq('org_code', orgCode).is('accepted_at', null).gt('expires_at', new Date().toISOString())
    if ((active ?? 0) + (pending ?? 0) >= org.seat_limit) return json({ error: `アカウント上限（${org.seat_limit}）に達しています` }, 400)

    const { error: invErr } = await admin.auth.admin.inviteUserByEmail(email, { data: { org_code: orgCode, role }, redirectTo: body.redirect_to })
    if (invErr) return json({ error: invErr.message }, 400)
    await admin.from('invitations').insert({ org_code: orgCode, email, role, created_by: user.id })
    await admin.from('audit_logs').insert({ actor: user.id, org_code: orgCode, action: 'user.invite', target: email })
    return json({ ok: true })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
