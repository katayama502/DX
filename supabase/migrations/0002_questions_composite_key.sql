-- 質問IDはテーマ内で一意（s0 / end など共通の名前がある）。行キーは theme_id:id とし、id はテーマ内の論理IDとして残す
alter table public.questions drop constraint questions_pkey;
alter table public.questions add column key text generated always as (coalesce(theme_id, '_shared') || ':' || id) stored;
alter table public.questions add primary key (key);
create unique index questions_theme_id_id on public.questions (coalesce(theme_id, '_shared'), id);
