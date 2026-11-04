-- 一覧機能のテスト入力・期待するSQL断片。DBでは実行しない。
-- 不正な入力がSQL本文へ混入しないこと、列名のエスケープが維持されることを検証する。

-- @section invalidDirection
DROP TABLE

-- @section invalidSort
record_id; DROP TABLE x

-- @section attackSearch
x%' OR 1=1;--_[~

-- @section attackFragment
OR 1=1

-- @section escapedPattern
%x~%' OR 1=1;--~_~[~~%

-- @section orderText
CONVERT(nvarchar(max), records.[memo]]]) DESC, records.[record_id] ASC

-- @section orderAmount
ORDER BY records.[amount] ASC, records.[record_id] ASC

-- @section formattedTimestamp
CONVERT(nvarchar(100), [recorded_at], 121)
