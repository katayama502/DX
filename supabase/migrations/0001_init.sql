-- DX相談ナビ 初期スキーマ（Supabase Postgres）
-- 方針：ヒアリング回答・相談票のテーブルは作らない（個人情報を持たない）。
--       団体をまたぐ読み取りは RLS で拒否。コンテンツは認証済み＆契約中の団体だけが読める。

create extension if not exists pgcrypto;

-- ========== 団体・ユーザー ==========
create table public.organizations (
  code           text primary key check (code ~ '^[a-z0-9-]{3,32}$'),
  name           text not null check (length(btrim(name)) between 1 and 120),
  kind           text not null default 'other' check (kind in ('city','shokokai','cci','other')),
  plan           text not null default 'basic' check (plan in ('regional','basic')),
  status         text not null default 'trial' check (status in ('trial','active','grace','expired','suspended')),
  contract_start date not null default current_date,
  contract_end   date not null check (contract_end >= contract_start),
  seat_limit     int  not null default 10 check (seat_limit between 1 and 200),
  logo_url       text check (logo_url is null or (length(logo_url) <= 2048 and logo_url ~ '^https://[^[:space:]]+$')),
  contact        text check (contact is null or length(contact) <= 500),
  region_links   jsonb not null default '[]'::jsonb check (jsonb_typeof(region_links) = 'array' and jsonb_array_length(region_links) <= 30 and octet_length(region_links::text) <= 50000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  org_code      text not null references public.organizations(code),
  email         text not null check (email = lower(btrim(email)) and length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  name          text not null default '' check (length(name) <= 100),
  role          text not null default 'staff' check (role in ('staff','org_admin','ops_admin')),
  status        text not null default 'active' check (status in ('invited','active','disabled')),
  last_login_at timestamptz,
  created_at    timestamptz not null default now()
);
create index on public.profiles(org_code);
create unique index profiles_email_unique on public.profiles(lower(email));

create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  org_code    text not null references public.organizations(code),
  email       text not null check (email = lower(btrim(email)) and length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  role        text not null default 'staff' check (role in ('staff','org_admin')),
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  auth_user_id uuid references auth.users(id) on delete cascade,
  sent_at     timestamptz,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  check (expires_at > created_at),
  check (sent_at is null or sent_at >= created_at),
  check (accepted_at is null or accepted_at >= created_at)
);
create index on public.invitations(org_code);
-- 1つのメールアドレスに複数団体の有効な招待をぶら下げず、Auth作成時の所属を一意に決める。
create unique index invitations_one_pending_email on public.invitations(lower(email)) where accepted_at is null;
create unique index invitations_auth_user on public.invitations(auth_user_id) where auth_user_id is not null;

create table public.escalation_contacts (
  id       uuid primary key default gen_random_uuid(),
  org_code text not null references public.organizations(code) on delete cascade,
  name     text not null check (length(btrim(name)) between 1 and 120),
  email    text not null check (email = lower(btrim(email)) and length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  phone    text check (phone is null or length(phone) <= 40),
  fields   text[] not null default '{}' check (cardinality(fields) <= 20 and length(array_to_string(fields, ',')) <= 2000),
  sort     int not null default 0 check (sort between -10000 and 10000)
);
create index on public.escalation_contacts(org_code);

-- ========== コンテンツ（Git → build-content --push で投入） ==========
create table public.themes (
  id             text primary key,
  name           text not null,
  category       text not null,
  icon           text not null default '💬',
  default_level  text not null check (default_level in ('blue','yellow','red','urgent')),
  urgent         boolean not null default false,
  sort           int not null default 99,
  case_ids       text[] not null default '{}',
  links          jsonb not null default '[]'::jsonb,
  reviewed_at    date not null,
  published      boolean not null default false,
  first_tell     text[] not null default '{}',
  misconceptions text[] not null default '{}',
  cost           text[] not null default '{}',
  next_steps     text[] not null default '{}',
  checklist      text[] not null default '{}',
  term_names     text[] not null default '{}'
);
create table public.questions (
  id       text primary key,
  theme_id text references public.themes(id) on delete cascade, -- null = 共通質問
  type     text not null check (type in ('say','ask_single','ask_multi','ask_text')),
  shared   boolean not null default false,
  text     text not null,
  why      text,
  options  text[] not null default '{}',
  show_if  jsonb,
  sort     int not null default 0
);
create table public.level_rules (
  id            text primary key,
  theme_id      text not null references public.themes(id) on delete cascade,
  if_conditions jsonb not null,
  then_level    text not null check (then_level in ('blue','yellow','red','urgent')),
  reason        text not null
);
create table public.theme_keywords (
  theme_id text not null references public.themes(id) on delete cascade,
  keyword  text not null,
  weight   int not null default 1,
  primary key (theme_id, keyword)
);
create table public.cases (
  id          text primary key,
  industry    text not null,
  no          int not null,
  stage       int not null check (stage between 1 and 3),
  title       text not null,
  summary     text not null,
  budget      int not null default 0,
  tools       text[] not null default '{}',
  detail      jsonb not null default '{}'::jsonb,
  theme_ids   text[] not null default '{}',
  type        text not null default 'model' check (type in ('model','regional')),
  reviewed_at date not null,
  generated   boolean not null default false,
  published   boolean not null default true
);
create table public.industries (id text primary key, name text not null, icon text not null default '', sort int not null default 0);
create table public.terms (term text primary key, reading text, description text not null, variants text[] not null default '{}');
create table public.synonyms (canonical text not null, variant text not null, primary key (canonical, variant));

-- 地域事例（団体ごと・実在。掲載許諾チェック必須）
create table public.regional_cases (
  id             uuid primary key default gen_random_uuid(),
  org_code       text not null references public.organizations(code) on delete cascade,
  title          text not null,
  summary        text not null,
  detail         jsonb not null default '{}'::jsonb,
  theme_ids      text[] not null default '{}',
  interviewed_at date not null,
  consent        boolean not null default false,
  published      boolean not null default false,
  created_at     timestamptz not null default now()
);

-- 運営からのお知らせ
create table public.announcements (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text not null,
  starts_at  date not null default current_date,
  ends_at    date,
  created_at timestamptz not null default now()
);

-- 利用状況（個人を特定しない日次カウントのみ）
create table public.usage_daily (
  org_code      text not null references public.organizations(code) on delete cascade,
  day           date not null default current_date,
  logins        int not null default 0,
  theme_views   int not null default 0,
  hearings_done int not null default 0,
  tickets_made  int not null default 0,
  onepagers     int not null default 0,
  primary key (org_code, day)
);

-- 監査ログ（団体設定・アカウント状態の変更。90日で削除）
create table public.audit_logs (
  id         bigserial primary key,
  actor      uuid,
  org_code   text,
  action     text not null check (length(action) between 1 and 100),
  target     text check (target is null or length(target) <= 500),
  detail     jsonb,
  created_at timestamptz not null default now()
);

-- ========== ヘルパー関数（RLS の再帰を避けるため security definer） ==========
create or replace function public.auth_role() returns text
language sql stable security definer set search_path = pg_catalog, public as
$$ select role from public.profiles where id = auth.uid() and status = 'active' $$;

create or replace function public.auth_org() returns text
language sql stable security definer set search_path = pg_catalog, public as
$$ select org_code from public.profiles where id = auth.uid() and status = 'active' $$;

create or replace function public.is_ops() returns boolean
language sql stable security definer set search_path = pg_catalog, public as
$$ select coalesce((select role = 'ops_admin' from public.profiles where id = auth.uid() and status = 'active'), false) $$;

-- 自分の団体が閲覧可能な状態か（trial/active、または契約終了後30日以内の grace）。ops は常に true
create or replace function public.org_can_read() returns boolean
language sql stable security definer set search_path = pg_catalog, public as
$$
  select public.is_ops() or exists (
    select 1 from public.organizations o
    join public.profiles p on p.org_code = o.code
    where p.id = auth.uid() and p.status = 'active'
      and o.contract_start <= current_date
      and o.status in ('trial','active','grace')
      and o.contract_end + interval '30 days' >= current_date
  )
$$;

-- ========== RLS ==========
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.invitations enable row level security;
alter table public.escalation_contacts enable row level security;
alter table public.themes enable row level security;
alter table public.questions enable row level security;
alter table public.level_rules enable row level security;
alter table public.theme_keywords enable row level security;
alter table public.cases enable row level security;
alter table public.industries enable row level security;
alter table public.terms enable row level security;
alter table public.synonyms enable row level security;
alter table public.regional_cases enable row level security;
alter table public.announcements enable row level security;
alter table public.usage_daily enable row level security;
alter table public.audit_logs enable row level security;

-- organizations
create policy org_select on public.organizations for select to authenticated
  using (public.is_ops() or code = public.auth_org());
create policy org_ops_all on public.organizations for all to authenticated
  using (public.is_ops()) with check (public.is_ops());

-- profiles
create policy prof_select on public.profiles for select to authenticated
  using (public.is_ops() or id = auth.uid() or (public.auth_role() = 'org_admin' and org_code = public.auth_org()));
create policy prof_ops_all on public.profiles for all to authenticated
  using (public.is_ops()) with check (public.is_ops());

-- invitations（作成・取消は Auth 側の補償処理も行う Edge Function 経由）
create policy inv_select on public.invitations for select to authenticated
  using (public.is_ops() or (public.auth_role() = 'org_admin' and org_code = public.auth_org()));

-- escalation_contacts
create policy esc_select on public.escalation_contacts for select to authenticated
  using (public.is_ops() or org_code = public.auth_org());
create policy esc_write on public.escalation_contacts for all to authenticated
  using (public.is_ops() or (public.auth_role() = 'org_admin' and org_code = public.auth_org()))
  with check (public.is_ops() or (public.auth_role() = 'org_admin' and org_code = public.auth_org()));

-- コンテンツ：契約中の団体の認証済みユーザーが公開分を読める。書き込みは ops のみ
create policy themes_select on public.themes for select to authenticated using (public.org_can_read() and (published or public.is_ops()));
create policy themes_ops on public.themes for all to authenticated using (public.is_ops()) with check (public.is_ops());
create policy q_select on public.questions for select to authenticated using (
  public.org_can_read() and (public.is_ops() or theme_id is null or exists (
    select 1 from public.themes t where t.id = questions.theme_id and t.published
  ))
);
create policy q_ops on public.questions for all to authenticated using (public.is_ops()) with check (public.is_ops());
create policy rules_select on public.level_rules for select to authenticated using (
  public.org_can_read() and (public.is_ops() or exists (
    select 1 from public.themes t where t.id = level_rules.theme_id and t.published
  ))
);
create policy rules_ops on public.level_rules for all to authenticated using (public.is_ops()) with check (public.is_ops());
create policy kw_select on public.theme_keywords for select to authenticated using (
  public.org_can_read() and (public.is_ops() or exists (
    select 1 from public.themes t where t.id = theme_keywords.theme_id and t.published
  ))
);
create policy kw_ops on public.theme_keywords for all to authenticated using (public.is_ops()) with check (public.is_ops());
create policy cases_select on public.cases for select to authenticated using (public.org_can_read() and (published or public.is_ops()));
create policy cases_ops on public.cases for all to authenticated using (public.is_ops()) with check (public.is_ops());
create policy ind_select on public.industries for select to authenticated using (public.org_can_read());
create policy ind_ops on public.industries for all to authenticated using (public.is_ops()) with check (public.is_ops());
create policy terms_select on public.terms for select to authenticated using (public.org_can_read());
create policy terms_ops on public.terms for all to authenticated using (public.is_ops()) with check (public.is_ops());
create policy syn_select on public.synonyms for select to authenticated using (public.org_can_read());
create policy syn_ops on public.synonyms for all to authenticated using (public.is_ops()) with check (public.is_ops());

create policy rc_select on public.regional_cases for select to authenticated
  using (public.is_ops() or (org_code = public.auth_org() and published and public.org_can_read()));
create policy rc_ops on public.regional_cases for all to authenticated using (public.is_ops()) with check (public.is_ops());

create policy ann_select on public.announcements for select to authenticated using (public.org_can_read());
create policy ann_ops on public.announcements for all to authenticated using (public.is_ops()) with check (public.is_ops());

create policy usage_select on public.usage_daily for select to authenticated
  using (public.is_ops() or (public.auth_role() = 'org_admin' and org_code = public.auth_org()));
create policy audit_select on public.audit_logs for select to authenticated using (public.is_ops());

-- ========== RPC ==========
-- 団体管理者が自団体の表示情報だけを更新する（契約・上限は触れない）
create or replace function public.update_org_profile(p_org_code text, p_name text, p_contact text, p_logo_url text, p_region_links jsonb)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_target text;
begin
  if not (public.is_ops() or public.auth_role() = 'org_admin') then raise exception 'forbidden'; end if;
  v_target := case when public.is_ops() then p_org_code else public.auth_org() end;
  if v_target is null or (not public.is_ops() and p_org_code <> v_target) then raise exception 'forbidden'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 120 then raise exception 'invalid name'; end if;
  if p_contact is not null and length(p_contact) > 500 then raise exception 'invalid contact'; end if;
  if p_logo_url is not null and (length(p_logo_url) > 2048 or p_logo_url !~ '^https://[^[:space:]]+$') then raise exception 'invalid logo url'; end if;
  if p_region_links is null or jsonb_typeof(p_region_links) <> 'array' or jsonb_array_length(p_region_links) > 30 then raise exception 'invalid region links'; end if;
  update public.organizations set name = coalesce(p_name, name), contact = p_contact, logo_url = p_logo_url,
    region_links = coalesce(p_region_links, '[]'::jsonb), updated_at = now()
  where code = v_target;
  if not found then raise exception 'organization not found'; end if;
  insert into public.audit_logs(actor, org_code, action, target) values (auth.uid(), v_target, 'org.profile.update', v_target);
end $$;

-- プロフィールの自己更新は名称だけに限定し、role/status/org_code は直接更新させない。
create or replace function public.update_my_name(p_name text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if public.auth_role() is null then raise exception 'forbidden'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 100 then raise exception 'invalid name'; end if;
  update public.profiles set name = btrim(p_name) where id = auth.uid() and status = 'active';
  if not found then raise exception 'profile not found'; end if;
end $$;

-- 団体管理者が自団体のスタッフを停止・再開する（自分自身と ops は対象外）
create or replace function public.set_user_status(p_user uuid, p_status text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_target public.profiles%rowtype;
        v_limit int;
        v_used int;
begin
  if p_status not in ('active','disabled') then raise exception 'invalid status'; end if;
  select * into v_target from public.profiles where id = p_user and role <> 'ops_admin' and status <> 'invited' for update;
  if not found then raise exception 'not found'; end if;
  if p_user = auth.uid() then raise exception 'cannot change own status'; end if;
  if not (public.is_ops() or (public.auth_role() = 'org_admin' and v_target.org_code = public.auth_org() and v_target.role = 'staff')) then raise exception 'forbidden'; end if;
  -- 団体行をロックし、招待と再開の同時実行でも seat_limit を超えないようにする。
  select seat_limit into v_limit from public.organizations where code = v_target.org_code for update;
  if p_status = 'active' and v_target.status <> 'active' then
    select
      (select count(*) from public.profiles where org_code = v_target.org_code and status = 'active') +
      (select count(*) from public.invitations where org_code = v_target.org_code and accepted_at is null and expires_at > now())
    into v_used;
    if v_used >= v_limit then raise exception 'seat limit reached'; end if;
  end if;
  update public.profiles set status = p_status where id = p_user;
  insert into public.audit_logs(actor, org_code, action, target, detail) values (auth.uid(), v_target.org_code, 'user.status', p_user::text, jsonb_build_object('status', p_status));
end $$;

-- Edge Function専用。団体行ロック下で権限、契約、重複、seatを検証して招待枠を予約する。
create or replace function public.reserve_invitation(p_actor uuid, p_org text, p_email text, p_role text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_actor public.profiles%rowtype;
        v_org public.organizations%rowtype;
        v_email text := lower(btrim(p_email));
        v_used int;
        v_id uuid;
begin
  if p_role not in ('staff','org_admin') then raise exception 'invalid role'; end if;
  if length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid email'; end if;
  select * into v_actor from public.profiles where id = p_actor and status = 'active' for share;
  if not found or v_actor.role not in ('org_admin','ops_admin') then raise exception 'forbidden'; end if;
  if v_actor.role = 'org_admin' and (v_actor.org_code <> p_org or p_role <> 'staff') then raise exception 'forbidden'; end if;
  select * into v_org from public.organizations where code = p_org for update;
  if not found then raise exception 'organization not found'; end if;
  if v_org.status not in ('trial','active') or v_org.contract_start > current_date or v_org.contract_end < current_date then
    raise exception 'organization is not under contract';
  end if;
  delete from public.invitations where lower(email) = v_email and accepted_at is null and expires_at <= now() and auth_user_id is null;
  if exists (select 1 from public.profiles where lower(email) = v_email) or
     exists (select 1 from public.invitations where lower(email) = v_email and accepted_at is null) then
    raise exception 'email already registered or invited';
  end if;
  select
    (select count(*) from public.profiles where org_code = p_org and status = 'active') +
    (select count(*) from public.invitations where org_code = p_org and accepted_at is null and expires_at > now())
  into v_used;
  if v_used >= v_org.seat_limit then raise exception 'seat limit reached: %', v_org.seat_limit; end if;
  insert into public.invitations(org_code, email, role, created_by)
  values (p_org, v_email, p_role, p_actor) returning id into v_id;
  insert into public.audit_logs(actor, org_code, action, target, detail)
  values (p_actor, p_org, 'user.invite.reserve', v_email, jsonb_build_object('invitation_id', v_id, 'role', p_role));
  return v_id;
end $$;

create or replace function public.finalize_invitation(p_actor uuid, p_invitation uuid, p_auth_user uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_actor public.profiles%rowtype;
        v_inv public.invitations%rowtype;
begin
  select * into v_actor from public.profiles where id = p_actor and status = 'active' and role in ('org_admin','ops_admin') for share;
  if not found then raise exception 'forbidden'; end if;
  select * into v_inv from public.invitations where id = p_invitation and accepted_at is null and expires_at > now() for update;
  if not found or v_inv.created_by <> p_actor or v_inv.auth_user_id is not null then raise exception 'invitation state mismatch'; end if;
  if v_actor.role = 'org_admin' and (v_actor.org_code <> v_inv.org_code or v_inv.role <> 'staff') then raise exception 'forbidden'; end if;
  -- EdgeがAuth Admin APIから受け取ったIDにだけ所属を付ける。email metadataやAuth INSERTトリガーは信頼しない。
  insert into public.profiles(id, org_code, email, name, role, status)
  values (p_auth_user, v_inv.org_code, v_inv.email, '', v_inv.role, 'invited');
  update public.invitations set auth_user_id = p_auth_user, sent_at = now() where id = p_invitation;
  insert into public.audit_logs(actor, org_code, action, target, detail)
  values (p_actor, v_inv.org_code, 'user.invite', v_inv.email, jsonb_build_object('invitation_id', p_invitation, 'role', v_inv.role));
end $$;

-- DB側のアクセスを先にfail-safeで破棄し、返したAuth IDをEdge Functionが削除する。
create or replace function public.cancel_invitation(p_actor uuid, p_invitation uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_actor public.profiles%rowtype;
        v_inv public.invitations%rowtype;
begin
  select * into v_actor from public.profiles where id = p_actor and status = 'active' for share;
  if not found or v_actor.role not in ('org_admin','ops_admin') then raise exception 'forbidden'; end if;
  select * into v_inv from public.invitations where id = p_invitation and accepted_at is null for update;
  if not found then raise exception 'invitation not found'; end if;
  if v_actor.role = 'org_admin' and (v_actor.org_code <> v_inv.org_code or v_inv.role <> 'staff') then raise exception 'forbidden'; end if;
  if v_inv.auth_user_id is not null then
    delete from public.profiles where id = v_inv.auth_user_id and status = 'invited';
  end if;
  delete from public.invitations where id = p_invitation;
  insert into public.audit_logs(actor, org_code, action, target, detail)
  values (p_actor, v_inv.org_code, 'user.invite.cancel', v_inv.email, jsonb_build_object('invitation_id', p_invitation));
  return v_inv.auth_user_id;
end $$;

-- 招待リンクから初めてセッションが成立した時だけ利用可能状態へ遷移させる。
create or replace function public.activate_my_invitation()
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_profile public.profiles%rowtype;
        v_inv public.invitations%rowtype;
        v_org public.organizations%rowtype;
begin
  select * into v_profile from public.profiles where id = auth.uid() for update;
  if not found or v_profile.status = 'active' then return; end if;
  if v_profile.status <> 'invited' then raise exception 'forbidden'; end if;
  select * into v_inv from public.invitations
    where auth_user_id = auth.uid() and accepted_at is null and expires_at > now() for update;
  if not found then raise exception 'no pending invitation'; end if;
  select * into v_org from public.organizations where code = v_profile.org_code for update;
  if not found or v_org.status not in ('trial','active') or v_org.contract_start > current_date or v_org.contract_end < current_date then
    raise exception 'organization is not under contract';
  end if;
  update public.profiles set status = 'active' where id = auth.uid();
  update public.invitations set accepted_at = now() where id = v_inv.id;
  insert into public.audit_logs(actor, org_code, action, target)
  values (auth.uid(), v_profile.org_code, 'user.invite.accept', auth.uid()::text);
end $$;

-- 利用状況カウント（個人は記録しない）
create or replace function public.bump_usage(p_kind text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_org text := public.auth_org();
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if p_kind not in ('logins','theme_views','hearings_done','tickets_made','onepagers') then raise exception 'invalid usage kind'; end if;
  insert into public.usage_daily(org_code, day) values (v_org, current_date) on conflict do nothing;
  execute format('update public.usage_daily set %I = %I + 1 where org_code = $1 and day = current_date', p_kind, p_kind) using v_org;
  if p_kind = 'logins' then update public.profiles set last_login_at = now() where id = auth.uid(); end if;
end $$;

-- 共有ページ（ログイン不要）：テーマの公開項目と団体の表示名・連絡先だけを返す。個人情報なし
create or replace function public.get_share(p_theme text, p_org text)
returns jsonb language sql stable security definer set search_path = pg_catalog, public as $$
  with eligible_org as (
    select * from public.organizations
    where code = p_org and length(p_org) between 3 and 32
      and contract_start <= current_date
      and status in ('trial','active','grace')
      and contract_end + interval '30 days' >= current_date
  )
  select jsonb_build_object(
    'theme', (select jsonb_build_object('id', id, 'name', name, 'icon', icon, 'firstTell', first_tell, 'nextSteps', next_steps,
                'cost', cost, 'checklist', checklist, 'links', links, 'reviewedAt', to_char(reviewed_at, 'YYYY-MM'))
              from public.themes where id = p_theme and length(p_theme) <= 100 and published and exists (select 1 from eligible_org)),
    'org', (select jsonb_build_object('code', code, 'name', name, 'contact', contact, 'logo_url', logo_url, 'region_links', region_links)
            from eligible_org)
  )
$$;

-- ========== トリガー ==========
-- 日付とstatusの矛盾をDB書込時にも許さない（suspendedだけは運営の明示停止を優先）。
create or replace function public.enforce_organization_contract() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_link jsonb;
begin
  if new.contract_end < new.contract_start then raise exception 'contract_end must be on or after contract_start'; end if;
  if jsonb_typeof(new.region_links) <> 'array' or jsonb_array_length(new.region_links) > 30 then raise exception 'invalid region links'; end if;
  for v_link in select value from jsonb_array_elements(new.region_links) loop
    if jsonb_typeof(v_link) is distinct from 'object'
      or jsonb_typeof(v_link->'name') is distinct from 'string'
      or jsonb_typeof(v_link->'url') is distinct from 'string'
      or length(btrim(v_link->>'name')) not between 1 and 120
      or length(v_link->>'url') > 2048
      or (v_link->>'url') !~ '^https://[^[:space:]]+$' then
      raise exception 'invalid region link';
    end if;
  end loop;
  if new.status <> 'suspended' then
    if new.contract_end + 30 < current_date then
      new.status := 'expired';
    elsif new.contract_end < current_date then
      new.status := 'grace';
    elsif new.status in ('grace','expired') then
      new.status := case when new.contract_start > current_date then 'trial' else 'active' end;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists organizations_contract_guard on public.organizations;
create trigger organizations_contract_guard before insert or update on public.organizations
for each row execute function public.enforce_organization_contract();

-- 契約終了の自動反映（毎日。pg_cron が有効な場合）
create or replace function public.rollover_contracts() returns void language sql security definer set search_path = pg_catalog, public as $$
  update public.organizations set status = 'grace' where status in ('trial','active') and contract_end < current_date;
  update public.organizations set status = 'expired' where status = 'grace' and contract_end + interval '30 days' < current_date;
  delete from public.audit_logs where created_at < now() - interval '90 days';
  delete from public.invitations where accepted_at is null and expires_at < now() - interval '30 days';
$$;

-- SECURITY DEFINER関数は既定のPUBLIC実行権を全て落とし、必要なロールだけに限定する。
revoke all on function public.auth_role() from public, anon, authenticated, service_role;
revoke all on function public.auth_org() from public, anon, authenticated, service_role;
revoke all on function public.is_ops() from public, anon, authenticated, service_role;
revoke all on function public.org_can_read() from public, anon, authenticated, service_role;
revoke all on function public.update_org_profile(text, text, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.update_my_name(text) from public, anon, authenticated, service_role;
revoke all on function public.set_user_status(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.reserve_invitation(uuid, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.finalize_invitation(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.cancel_invitation(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.activate_my_invitation() from public, anon, authenticated, service_role;
revoke all on function public.bump_usage(text) from public, anon, authenticated, service_role;
revoke all on function public.get_share(text, text) from public, anon, authenticated, service_role;
revoke all on function public.enforce_organization_contract() from public, anon, authenticated, service_role;
revoke all on function public.rollover_contracts() from public, anon, authenticated, service_role;

grant execute on function public.auth_role() to authenticated;
grant execute on function public.auth_org() to authenticated;
grant execute on function public.is_ops() to authenticated;
grant execute on function public.org_can_read() to authenticated;
grant execute on function public.update_org_profile(text, text, text, text, jsonb) to authenticated;
grant execute on function public.update_my_name(text) to authenticated;
grant execute on function public.set_user_status(uuid, text) to authenticated;
grant execute on function public.activate_my_invitation() to authenticated;
grant execute on function public.bump_usage(text) to authenticated;
grant execute on function public.get_share(text, text) to anon, authenticated;
grant execute on function public.reserve_invitation(uuid, text, text, text) to service_role;
grant execute on function public.finalize_invitation(uuid, uuid, uuid) to service_role;
grant execute on function public.cancel_invitation(uuid, uuid) to service_role;
grant execute on function public.rollover_contracts() to service_role;
