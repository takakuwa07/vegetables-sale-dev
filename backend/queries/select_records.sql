-- 設定されたテーブルの列定義からSQLを組み立て、利用者の入力は直接埋め込まない。
-- 主キーを並べ替えの末尾へ追加し、同じ値の行があってもページ順を安定させる。
SELECT {{columns}}
FROM {{table}} AS records
{{where}}
ORDER BY {{order}}
OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
