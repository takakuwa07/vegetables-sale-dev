-- 📋 列定義と主キーの順番を、実テーブルから読み取る。DDLは実行しない。
SELECT
    c.name,
    TYPE_NAME(c.system_type_id) AS type,
    c.column_id AS position,
    COALESCE(pk.key_ordinal, 0) AS keyOrder
FROM sys.columns AS c
INNER JOIN sys.tables AS t ON t.object_id = c.object_id
INNER JOIN sys.schemas AS s ON s.schema_id = t.schema_id
OUTER APPLY (
    SELECT ic.key_ordinal
    FROM sys.indexes AS i
    INNER JOIN sys.index_columns AS ic
        ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    WHERE i.object_id = c.object_id AND i.is_primary_key = 1 AND ic.column_id = c.column_id
) AS pk
WHERE s.name = N'dbo' AND t.name = N't_vegetable_sales' AND c.is_hidden = 0
ORDER BY c.column_id;
