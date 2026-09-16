-- 最初の運営（クリエット管理者）アカウントの作成手順
-- 1. Supabase ダッシュボード → Authentication → Users → 「Add user」で
--    メールアドレスとパスワードを入力し「Auto Confirm User」を ON にして作成する
-- 2. 下の SQL の <メールアドレス> を置き換えて SQL Editor で実行する（profiles に運営権限の行を作る）
insert into public.profiles (id, org_code, email, name, role, status)
select u.id, 'creatte', lower(u.email), '運営担当', 'ops_admin', 'active'
from auth.users u
where lower(u.email) = lower('<メールアドレス>')
on conflict (id) do update set role = 'ops_admin', status = 'active', org_code = 'creatte';

-- 確認
select p.email, p.role, p.status, p.org_code from public.profiles p where p.role = 'ops_admin';
