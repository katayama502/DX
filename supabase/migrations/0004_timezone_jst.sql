-- 利用者・団体はすべて日本国内（JST）のため、契約開始/終了・確認日などの日付比較を
-- サーバー側でもJSTの暦日で行う（既定のUTCのままだと、深夜0時〜朝9時の間 current_date が
-- 前日のままになり、契約終了・地域事例の公開判定などが最大9時間ずれる）。
alter database postgres set timezone to 'Asia/Tokyo';
