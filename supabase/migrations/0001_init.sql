-- DX相談ナビ 初期スキーマ（Supabase Postgres）
-- 方針：ヒアリング回答・相談票のテーブルは作らない（個人情報を持たない）。
--       団体をまたぐ読み取りは RLS で拒否。コンテンツは認証済み＆契約中の団体だけが読める。

create extension if not exists pgcrypto;

-- ========== 団体・ユーザー ==========
create table public.organizations (
  code           text primary key check (code ~ '^[a-z0-9-]{3,32}$'),
  name           text not null,
  kind           text not null default 'other' check (kind in ('city','shokokai','cci','other')),
  plan           text not null default 'basic' check (plan in ('regional','basic')),
  status         text not null default 'trial' check (status in ('trial','active','grace','expired','suspended')),
  contract_start date not null default current_date,
  contract_end   date not null,
  seat_limit     int  not null default 10 check (seat_limit between 1 and 200),
  logo_url       text,
  contact        text,
  region_links   jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  org_code      text not null references public.organizations(code),
  email         text not null,
  name          text not null default '',
  role          text not null default 'staff' check (role in ('staff','org_admin','ops_admin')),
  status        text not null default 'active' check (status in ('invited','active','disabled')),
  last_login_at timestamptz,
  created_at    timestamptz not null default now()
);
create index on public.profiles(org_code);

create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  org_code    text not null references public.organizations(code),
  email       text not null,
  role        text not null default 'staff' check (role in ('staff','org_admin')),
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
create index on public.invitations(org_code);

create table public.escalation_contacts (
  id       uuid primary key default gen_random_uuid(),
  org_code text not null references public.organizations(code) on delete cascade,
  name     text not null,
  email    text not null,
  phone    text,
  fields   text[] not null default '{}',
  sort     int not null default 0
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
  action     text not null,
  target     text,
  detail     jsonb,
  created_at timestamptz not null default now()
);

-- ========== ヘルパー関数（RLS の再帰を避けるため security definer） ==========
create or replace function public.auth_role() returns text
language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.auth_org() returns text
language sql stable security definer set search_path = public as
$$ select org_code from public.profiles where id = auth.uid() $$;

create or replace function public.is_ops() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select role = 'ops_admin' from public.profiles where id = auth.uid()), false) $$;

-- 自分の団体が閲覧可能な状態か（trial/active、または契約終了後30日以内の grace）。ops は常に true
create or replace function public.org_can_read() returns boolean
language sql stable security definer set search_path = public as
$$
  select public.is_ops() or exists (
    select 1 from public.organizations o
    join public.profiles p on p.org_code = o.code
    where p.id = auth.uid() and p.status = 'active'
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
create policy prof_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = public.auth_role() and org_code = public.auth_org());
create policy prof_ops_all on public.profiles for all to authenticated
  using (public.is_ops()) with check (public.is_ops());

-- invitations（作成は Edge Function（service role）経由。団体管理者は自団体分を閲覧・削除）
create policy inv_select on public.invitations for select to authenticated
  using (public.is_ops() or (public.auth_role() = 'org_admin' and org_code = public.auth_org()));
create policy inv_delete on public.invitations for delete to authenticated
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
create policy q_select on public.questions for select to authenticated using (public.org_can_read());
create policy q_ops on public.questions for all to authenticated using (public.is_ops()) with check (public.is_ops());
create policy rules_select on public.level_rules for select to authenticated using (public.org_can_read());
create policy rules_ops on public.level_rules for all to authenticated using (public.is_ops()) with check (public.is_ops());
create policy kw_select on public.theme_keywords for select to authenticated using (public.org_can_read());
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

create policy ann_select on public.announcements for select to authenticated using (true);
create policy ann_ops on public.announcements for all to authenticated using (public.is_ops()) with check (public.is_ops());

create policy usage_select on public.usage_daily for select to authenticated
  using (public.is_ops() or (public.auth_role() = 'org_admin' and org_code = public.auth_org()));
create policy audit_select on public.audit_logs for select to authenticated using (public.is_ops());

-- ========== RPC ==========
-- 団体管理者が自団体の表示情報だけを更新する（契約・上限は触れない）
create or replace function public.update_org_profile(p_name text, p_contact text, p_logo_url text, p_region_links jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_ops() or public.auth_role() = 'org_admin') then raise exception 'forbidden'; end if;
  update public.organizations set name = coalesce(p_name, name), contact = p_contact, logo_url = p_logo_url,
    region_links = coalesce(p_region_links, '[]'::jsonb), updated_at = now()
  where code = public.auth_org();
  insert into public.audit_logs(actor, org_code, action, target) values (auth.uid(), public.auth_org(), 'org.profile.update', public.auth_org());
end $$;

-- 団体管理者が自団体のスタッフを停止・再開する（自分自身と ops は対象外）
create or replace function public.set_user_status(p_user uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_org text;
begin
  if p_status not in ('active','disabled') then raise exception 'invalid status'; end if;
  select org_code into v_org from public.profiles where id = p_user and role <> 'ops_admin';
  if v_org is null then raise exception 'not found'; end if;
  if p_user = auth.uid() then raise exception 'cannot change own status'; end if;
  if not (public.is_ops() or (public.auth_role() = 'org_admin' and v_org = public.auth_org())) then raise exception 'forbidden'; end if;
  update public.profiles set status = p_status where id = p_user;
  insert into public.audit_logs(actor, org_code, action, target, detail) values (auth.uid(), v_org, 'user.status', p_user::text, jsonb_build_object('status', p_status));
end $$;

-- 利用状況カウント（個人は記録しない）
create or replace function public.bump_usage(p_kind text)
returns void language plpgsql security definer set search_path = public as $$
declare v_org text := public.auth_org();
begin
  if v_org is null then return; end if;
  if p_kind not in ('logins','theme_views','hearings_done','tickets_made','onepagers') then return; end if;
  insert into public.usage_daily(org_code, day) values (v_org, current_date) on conflict do nothing;
  execute format('update public.usage_daily set %I = %I + 1 where org_code = $1 and day = current_date', p_kind, p_kind) using v_org;
end $$;

-- 共有ページ（ログイン不要）：テーマの公開項目と団体の表示名・連絡先だけを返す。個人情報なし
create or replace function public.get_share(p_theme text, p_org text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'theme', (select jsonb_build_object('id', id, 'name', name, 'icon', icon, 'firstTell', first_tell, 'nextSteps', next_steps,
                'cost', cost, 'checklist', checklist, 'links', links, 'reviewedAt', to_char(reviewed_at, 'YYYY-MM'))
              from public.themes where id = p_theme and published),
    'org', (select jsonb_build_object('code', code, 'name', name, 'contact', contact, 'logo_url', logo_url, 'region_links', region_links)
            from public.organizations where code = p_org and status in ('trial','active','grace'))
  )
$$;
grant execute on function public.get_share(text, text) to anon, authenticated;
grant execute on function public.bump_usage(text) to authenticated;
grant execute on function public.update_org_profile(text, text, text, jsonb) to authenticated;
grant execute on function public.set_user_status(uuid, text) to authenticated;

-- ========== トリガー ==========
-- 招待経由でサインアップしたユーザーの profile を作る（metadata に org_code / role / name を持たせる）
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_org text := new.raw_user_meta_data->>'org_code';
        v_role text := coalesce(new.raw_user_meta_data->>'role', 'staff');
begin
  if v_org is null then return new; end if; -- 招待以外のサインアップは profile を作らない（= 何も見えない）
  insert into public.profiles(id, org_code, email, name, role, status)
  values (new.id, v_org, new.email, coalesce(new.raw_user_meta_data->>'name', ''), v_role, 'active')
  on conflict (id) do nothing;
  update public.invitations set accepted_at = now() where email = new.email and org_code = v_org and accepted_at is null;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- 契約終了の自動反映（毎日。pg_cron が有効な場合）
create or replace function public.rollover_contracts() returns void language sql security definer set search_path = public as $$
  update public.organizations set status = 'grace' where status in ('trial','active') and contract_end < current_date;
  update public.organizations set status = 'expired' where status = 'grace' and contract_end + interval '30 days' < current_date;
  delete from public.audit_logs where created_at < now() - interval '90 days';
  delete from public.invitations where accepted_at is null and expires_at < now() - interval '30 days';
$$;
