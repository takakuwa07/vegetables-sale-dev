-- レコード一覧用SQLの断片。各セクションはJS側で必要なものだけ選んで組み合わせる。
-- 差し込めるのは実列から作った識別子・SQL断片・固定の変換書式番号だけ。
-- 値の検索には@searchを使い、利用者の検索語はテンプレートへ差し込まない。

-- @section identifier
[{{name}}]

-- @section qualifiedColumn
records.{{column}}

-- @section qualifiedTable
{{schema}}.{{table}}

-- @section orderText
CONVERT(nvarchar(max), {{column}})

-- @section orderAscending
{{column}} ASC

-- @section orderDescending
{{column}} DESC

-- @section formattedValue
CONVERT(nvarchar(100), {{column}}, {{style}})

-- @section binaryValue
CONVERT(varchar(max), CONVERT(varbinary(max), {{column}}), 1)

-- @section xmlValue
CONVERT(nvarchar(max), {{column}})

-- @section objectValue
{{column}}.ToString()

-- @section variantValue
CONVERT(nvarchar(max), {{column}})

-- @section selectedColumn
{{expression}} AS {{column}}

-- @section searchCondition
CONVERT(nvarchar(max), {{column}}, 121) LIKE @search ESCAPE N'~'

-- @section searchWhere
WHERE ({{conditions}})

-- @section emptySearch
1 = 0

-- @section searchJoin
OR

-- @section listJoin
,
