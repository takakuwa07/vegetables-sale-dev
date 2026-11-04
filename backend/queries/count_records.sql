-- records-count: 検索結果の総件数。検索語は@searchパラメーターで受け取る。
SELECT COUNT_BIG(*) AS total
FROM {{table}}
{{where}};
