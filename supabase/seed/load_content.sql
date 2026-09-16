-- content.json（GitHub の main ブランチ）を http 拡張で取得し、コンテンツ各テーブルへ upsert する。
-- 使い方：npm run content:build → supabase/seed/content.json を commit & push → この SQL を SQL Editor で実行
create extension if not exists http with schema extensions;

do $$
declare j jsonb;
        r record;
begin
  select content::jsonb into j from extensions.http_get('https://raw.githubusercontent.com/katayama502/DX/main/supabase/seed/content.json');
  if j is null then raise exception 'content.json を取得できませんでした'; end if;

  insert into public.industries (id, name, icon, sort)
  select e->>'id', e->>'name', e->>'icon', (ord - 1)::int from jsonb_array_elements(j->'industries') with ordinality as t(e, ord)
  on conflict (id) do update set name = excluded.name, icon = excluded.icon, sort = excluded.sort;

  insert into public.themes (id, name, category, icon, default_level, urgent, sort, case_ids, links, reviewed_at, published, first_tell, misconceptions, cost, next_steps, checklist, term_names)
  select e->>'id', e->>'name', e->>'category', coalesce(e->>'icon','💬'), e->>'level', coalesce((e->>'urgent')::boolean,false), (e->>'order')::int,
    array(select jsonb_array_elements_text(e->'cases')), coalesce(e->'links','[]'::jsonb), (e->>'reviewedAt' || '-01')::date, coalesce((e->>'published')::boolean,true),
    array(select jsonb_array_elements_text(e->'firstTell')), array(select jsonb_array_elements_text(e->'misconceptions')), array(select jsonb_array_elements_text(e->'cost')),
    array(select jsonb_array_elements_text(e->'nextSteps')), array(select jsonb_array_elements_text(e->'checklist')), array(select jsonb_array_elements_text(e->'terms'))
  from jsonb_array_elements(j->'themes') e
  -- sort と published は管理ダッシュボードで運営が調整できる値なので、既存行がある場合は上書きしない（新規テーマのみ frontmatter の値で作成）
  on conflict (id) do update set name = excluded.name, category = excluded.category, icon = excluded.icon, default_level = excluded.default_level, urgent = excluded.urgent,
    case_ids = excluded.case_ids, links = excluded.links, reviewed_at = excluded.reviewed_at, first_tell = excluded.first_tell, misconceptions = excluded.misconceptions,
    cost = excluded.cost, next_steps = excluded.next_steps, checklist = excluded.checklist, term_names = excluded.term_names;

  insert into public.questions (id, theme_id, type, shared, text, why, options, show_if, sort)
  select e->>'id', e->>'themeId', e->>'type', coalesce((e->>'shared')::boolean,false), e->>'text', e->>'why',
    coalesce(array(select jsonb_array_elements_text(e->'options')), '{}'), e->'showIf', (e->>'sort')::int
  from jsonb_array_elements(j->'nodes') e
  on conflict (key) do update set type = excluded.type, shared = excluded.shared, text = excluded.text, why = excluded.why, options = excluded.options, show_if = excluded.show_if, sort = excluded.sort;

  insert into public.level_rules (id, theme_id, if_conditions, then_level, reason)
  select e->>'id', e->>'themeId', e->'if', e->>'level', e->>'reason' from jsonb_array_elements(j->'rules') e
  on conflict (id) do update set theme_id = excluded.theme_id, if_conditions = excluded.if_conditions, then_level = excluded.then_level, reason = excluded.reason;

  delete from public.theme_keywords;
  insert into public.theme_keywords (theme_id, keyword, weight)
  select e->>'themeId', e->>'keyword', (e->>'weight')::int from jsonb_array_elements(j->'keywords') e
  on conflict (theme_id, keyword) do update set weight = excluded.weight;

  insert into public.terms (term, reading, description, variants)
  select e->>'term', e->>'reading', e->>'description', coalesce(array(select jsonb_array_elements_text(e->'variants')), '{}') from jsonb_array_elements(j->'terms') e
  on conflict (term) do update set reading = excluded.reading, description = excluded.description, variants = excluded.variants;

  delete from public.synonyms;
  insert into public.synonyms (canonical, variant)
  select e->>'canonical', v from jsonb_array_elements(j->'synonyms') e, jsonb_array_elements_text(e->'variants') v
  on conflict do nothing;

  insert into public.cases (id, industry, no, stage, title, summary, budget, tools, detail, theme_ids, type, reviewed_at, generated, published)
  select e->>'id', e->>'industry', (e->>'no')::int, (e->>'stage')::int, e->>'title', e->>'summary', (e->>'budget')::int,
    coalesce(array(select jsonb_array_elements_text(e->'tools')), '{}'), coalesce(e->'detail','{}'::jsonb), coalesce(array(select jsonb_array_elements_text(e->'themes')), '{}'),
    coalesce(e->>'type','model'), (e->>'reviewedAt' || '-01')::date, coalesce((e->>'generated')::boolean,false), true
  from jsonb_array_elements(j->'cases') e
  -- published は管理ダッシュボードで運営が切り替える値なので、既存行がある場合は上書きしない（新規事例のみ true で作成）
  on conflict (id) do update set industry = excluded.industry, no = excluded.no, stage = excluded.stage, title = excluded.title, summary = excluded.summary, budget = excluded.budget,
    tools = excluded.tools, detail = excluded.detail, theme_ids = excluded.theme_ids, type = excluded.type, reviewed_at = excluded.reviewed_at, generated = excluded.generated;

  raise notice 'loaded: themes=% cases=%', (select count(*) from public.themes), (select count(*) from public.cases);
end $$;
