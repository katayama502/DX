// 招待レコードをDBで先に予約してからAuthユーザーを作成する。
// Auth APIとPostgresは同一トランザクションにできないため、失敗時はDBアクセスを先に破棄するfail-safe補償を行う。
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json' },
})

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`server configuration is missing: ${name}`)
  return value
}

function inviteRedirect(requested: unknown): string {
  const siteUrl = Deno.env.get('SITE_URL')?.trim()
  const configured = (Deno.env.get('INVITE_REDIRECT_ALLOWLIST') ?? '')
    .split(',').map((value) => value.trim()).filter(Boolean)
  const allowedOrigins = new Set<string>()
  for (const value of [...configured, ...(siteUrl ? [siteUrl] : [])]) {
    try { allowedOrigins.add(new URL(value).origin) } catch { throw new Error('invalid redirect allowlist configuration') }
  }
  const candidate = typeof requested === 'string' && requested.trim()
    ? requested.trim()
    : siteUrl ? new URL('/welcome', siteUrl).toString() : ''
  if (!candidate || allowedOrigins.size === 0) throw new Error('invite redirect is not configured')
  let url: URL
  try { url = new URL(candidate) } catch { throw new Error('invalid redirect url') }
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
  if ((!localHttp && url.protocol !== 'https:') || !allowedOrigins.has(url.origin) || url.pathname !== '/welcome' || url.username || url.password) {
    throw new Error('redirect url is not allowed')
  }
  url.hash = ''
  return url.toString()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  try {
    const authorization = req.headers.get('Authorization') ?? ''
    if (!/^Bearer\s+\S+$/i.test(authorization)) return json({ error: 'unauthorized' }, 401)

    const url = requiredEnv('SUPABASE_URL')
    const anon = requiredEnv('SUPABASE_ANON_KEY')
    const service = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    const caller = createClient(url, anon, { global: { headers: { Authorization: authorization } } })
    const { data: { user }, error: userError } = await caller.auth.getUser()
    if (userError || !user) return json({ error: 'unauthorized' }, 401)

    let body: Record<string, unknown>
    try { body = await req.json() as Record<string, unknown> } catch { return json({ error: 'invalid json' }, 400) }
    const action = body.action === 'cancel' ? 'cancel' : body.action === 'invite' ? 'invite' : null
    if (!action) return json({ error: 'invalid action' }, 400)

    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })

    if (action === 'cancel') {
      const invitationId = String(body.invitation_id ?? '')
      if (!uuidPattern.test(invitationId)) return json({ error: 'invalid invitation id' }, 400)
      const { data: authUserId, error: cancelError } = await admin.rpc('cancel_invitation', {
        p_actor: user.id,
        p_invitation: invitationId,
      })
      if (cancelError) return json({ error: '招待を取り消す権限がないか、招待が見つかりません' }, 403)
      if (authUserId) {
        const { error: deleteError } = await admin.auth.admin.deleteUser(String(authUserId))
        if (deleteError) {
          console.error('orphaned invited auth user after fail-safe DB cancellation', authUserId, deleteError.message)
          return json({ error: 'アプリへのアクセスは取り消しましたが、認証情報の削除に失敗しました。運営にお問い合わせください' }, 500)
        }
      }
      return json({ ok: true })
    }

    const email = String(body.email ?? '').trim().toLowerCase()
    const role = body.role === 'staff' || body.role === 'org_admin' ? body.role : null
    const orgCode = String(body.org_code ?? '').trim()
    if (!emailPattern.test(email) || email.length > 254) return json({ error: 'メールアドレスの形式が正しくありません' }, 400)
    if (!role) return json({ error: '招待権限が正しくありません' }, 400)
    if (!/^[a-z0-9-]{3,32}$/.test(orgCode)) return json({ error: '団体コードが正しくありません' }, 400)

    let redirectTo: string
    try { redirectTo = inviteRedirect(body.redirect_to) } catch { return json({ error: '招待先URLが許可されていません' }, 400) }

    const { data: invitationId, error: reserveError } = await admin.rpc('reserve_invitation', {
      p_actor: user.id,
      p_org: orgCode,
      p_email: email,
      p_role: role,
    })
    if (reserveError || !invitationId) {
      const message = reserveError?.message ?? ''
      if (/seat limit reached/i.test(message)) return json({ error: 'アカウント上限に達しています' }, 409)
      if (/already registered or invited/i.test(message)) return json({ error: 'このメールアドレスは登録済みまたは招待中です' }, 409)
      if (/not under contract/i.test(message)) return json({ error: '契約中の団体ではありません' }, 400)
      return json({ error: 'この操作を行う権限がありません' }, 403)
    }

    const compensate = async (knownAuthUserId?: string) => {
      const { data: storedAuthUserId, error: cancelError } = await admin.rpc('cancel_invitation', {
        p_actor: user.id,
        p_invitation: invitationId,
      })
      if (cancelError) console.error('failed to compensate invitation reservation', invitationId, cancelError.message)
      const authUserId = knownAuthUserId ?? (storedAuthUserId ? String(storedAuthUserId) : undefined)
      if (authUserId) {
        const { error: deleteError } = await admin.auth.admin.deleteUser(authUserId)
        if (deleteError) console.error('failed to compensate invited auth user', authUserId, deleteError.message)
      }
      return !cancelError
    }

    // org_code/roleはmetadataに入れない。DBトリガーは予約済み招待だけを信頼する。
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo })
    if (inviteError || !invited.user) {
      await compensate(invited.user?.id)
      return json({ error: '招待メールを送信できませんでした。時間をおいてお試しください' }, 400)
    }

    const { error: finalizeError } = await admin.rpc('finalize_invitation', {
      p_actor: user.id,
      p_invitation: invitationId,
      p_auth_user: invited.user.id,
    })
    if (finalizeError) {
      const compensated = await compensate(invited.user.id)
      console.error('failed to finalize invitation', invitationId, finalizeError.message)
      return json({ error: compensated
        ? '招待の確定に失敗したため取り消しました。もう一度お試しください'
        : '招待処理が不完全です。運営にお問い合わせください' }, 500)
    }

    return json({ ok: true })
  } catch (error) {
    console.error(error)
    return json({ error: 'サーバー設定または処理でエラーが発生しました' }, 500)
  }
})
