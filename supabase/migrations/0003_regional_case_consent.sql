-- 地域事例は事業者の掲載許諾（consent）が無いと公開できない（F-012・仕様書10.1の公平性ルール相当）
alter table public.regional_cases
  add constraint regional_cases_consent_required check (not published or consent);
