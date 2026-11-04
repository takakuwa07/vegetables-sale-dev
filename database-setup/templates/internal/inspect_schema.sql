-- 初期構築DDLの列・主キー・既定値の確認用。データ行は取得しない。
SELECT c.column_id, c.name, TYPE_NAME(c.system_type_id) AS type_name,
        c.max_length, c.precision, c.scale, c.is_nullable, c.is_identity, c.is_computed,
        CONVERT(nvarchar(100), ic.seed_value) AS identity_seed,
        CONVERT(nvarchar(100), ic.increment_value) AS identity_increment,
        dc.definition AS default_definition, cc.definition AS computed_definition, cc.is_persisted
FROM sys.columns AS c
LEFT JOIN sys.identity_columns AS ic ON ic.object_id = c.object_id AND ic.column_id = c.column_id
LEFT JOIN sys.default_constraints AS dc ON dc.object_id = c.default_object_id
LEFT JOIN sys.computed_columns AS cc ON cc.object_id = c.object_id AND cc.column_id = c.column_id
WHERE c.object_id = OBJECT_ID(N'{{schema}}.{{table}}')
ORDER BY c.column_id;

SELECT i.name, i.is_primary_key, i.is_unique, col.name AS column_name,
        ix.key_ordinal, ix.is_descending_key, ix.is_included_column, i.type_desc
FROM sys.indexes AS i
INNER JOIN sys.index_columns AS ix ON ix.object_id = i.object_id AND ix.index_id = i.index_id
INNER JOIN sys.columns AS col ON col.object_id = ix.object_id AND col.column_id = ix.column_id
WHERE i.object_id = OBJECT_ID(N'{{schema}}.{{table}}')
ORDER BY i.index_id, ix.key_ordinal;

SELECT name, definition FROM sys.check_constraints
WHERE parent_object_id = OBJECT_ID(N'{{schema}}.{{table}}');
