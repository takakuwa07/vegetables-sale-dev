-- SQL Server向け。初期構築用のサンプルデータを登録する。
-- GOやSQLCMDモードは不要。既存の表とデータは保持する。

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;

USE [vegetables_maintenance_db];

-- 空の参照データ表に限り、架空の野菜参照データを300件登録する。
-- 既存データの削除・上書き・追加入力は行わず、再実行しても件数を増やさない。
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM dbo.t_vegetable_sales WITH (UPDLOCK, HOLDLOCK))
BEGIN
    ;WITH digits AS (
        SELECT n FROM (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9)) AS digit(n)
    ), numbers AS (
        SELECT a.n + b.n * 10 + c.n * 100 AS n
        FROM digits AS a CROSS JOIN digits AS b CROSS JOIN digits AS c
        WHERE a.n + b.n * 10 + c.n * 100 < 300
    ), vegetables AS (
        SELECT * FROM (VALUES
            (0, N'トマト', N'桃太郎', N'果菜類', N'熊本県', N'サンプル市A', N'赤', N'個', 180),
            (1, N'きゅうり', N'夏すずみ', N'果菜類', N'宮崎県', N'サンプル市B', N'緑', N'本', 80),
            (2, N'にんじん', N'向陽二号', N'根菜類', N'北海道', N'サンプル市C', N'橙', N'本', 120),
            (3, N'ほうれん草', N'寒締め', N'葉菜類', N'千葉県', N'サンプル市D', N'緑', N'束', 200),
            (4, N'大根', N'青首', N'根菜類', N'神奈川県', N'サンプル市E', N'白', N'本', 240),
            (5, N'なす', N'千両二号', N'果菜類', N'高知県', N'サンプル市F', N'紫', N'本', 150),
            (6, N'キャベツ', N'春キャベツ', N'葉菜類', N'愛知県', N'サンプル市G', N'緑', N'玉', 280),
            (7, N'じゃがいも', N'男爵', N'いも類', N'北海道', N'サンプル市H', N'茶', N'袋', 300),
            (8, N'玉ねぎ', N'黄玉', N'根菜類', N'佐賀県', N'サンプル市I', N'黄', N'袋', 220),
            (9, N'ピーマン', N'京みどり', N'果菜類', N'茨城県', N'サンプル市J', N'緑', N'袋', 160)
        ) AS vegetable(id, name, variety, category, prefecture, city, color, unit, price)
    )
    INSERT INTO dbo.t_vegetable_sales (
        sale_date, vegetable_name, variety_name, vegetable_category,
        origin_prefecture, origin_city, color, producer_name, sales_unit,
        unit_price, quantity, store_name, remarks
    )
    SELECT DATEADD(day, numbers.n % 60, CONVERT(date, '20260101', 112)),
            vegetables.name, vegetables.variety, vegetables.category,
            vegetables.prefecture, vegetables.city, vegetables.color,
            N'サンプル生産者' + CONVERT(nvarchar(10), numbers.n % 5 + 1),
            vegetables.unit, vegetables.price + numbers.n % 4 * 10,
            numbers.n % 15 + 1,
            N'サンプル店舗' + CONVERT(nvarchar(10), numbers.n % 3 + 1),
            N'動作確認用のダミーデータ'
    FROM numbers
    INNER JOIN vegetables ON vegetables.id = numbers.n % 10;
END;

COMMIT TRANSACTION;


USE [vegetables_maintenance_db-dev];

-- 空の参照データ表に限り、架空の野菜参照データを300件登録する。
-- 既存データの削除・上書き・追加入力は行わず、再実行しても件数を増やさない。
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM dbo.t_vegetable_sales WITH (UPDLOCK, HOLDLOCK))
BEGIN
    ;WITH digits AS (
        SELECT n FROM (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9)) AS digit(n)
    ), numbers AS (
        SELECT a.n + b.n * 10 + c.n * 100 AS n
        FROM digits AS a CROSS JOIN digits AS b CROSS JOIN digits AS c
        WHERE a.n + b.n * 10 + c.n * 100 < 300
    ), vegetables AS (
        SELECT * FROM (VALUES
            (0, N'トマト', N'桃太郎', N'果菜類', N'熊本県', N'サンプル市A', N'赤', N'個', 180),
            (1, N'きゅうり', N'夏すずみ', N'果菜類', N'宮崎県', N'サンプル市B', N'緑', N'本', 80),
            (2, N'にんじん', N'向陽二号', N'根菜類', N'北海道', N'サンプル市C', N'橙', N'本', 120),
            (3, N'ほうれん草', N'寒締め', N'葉菜類', N'千葉県', N'サンプル市D', N'緑', N'束', 200),
            (4, N'大根', N'青首', N'根菜類', N'神奈川県', N'サンプル市E', N'白', N'本', 240),
            (5, N'なす', N'千両二号', N'果菜類', N'高知県', N'サンプル市F', N'紫', N'本', 150),
            (6, N'キャベツ', N'春キャベツ', N'葉菜類', N'愛知県', N'サンプル市G', N'緑', N'玉', 280),
            (7, N'じゃがいも', N'男爵', N'いも類', N'北海道', N'サンプル市H', N'茶', N'袋', 300),
            (8, N'玉ねぎ', N'黄玉', N'根菜類', N'佐賀県', N'サンプル市I', N'黄', N'袋', 220),
            (9, N'ピーマン', N'京みどり', N'果菜類', N'茨城県', N'サンプル市J', N'緑', N'袋', 160)
        ) AS vegetable(id, name, variety, category, prefecture, city, color, unit, price)
    )
    INSERT INTO dbo.t_vegetable_sales (
        sale_date, vegetable_name, variety_name, vegetable_category,
        origin_prefecture, origin_city, color, producer_name, sales_unit,
        unit_price, quantity, store_name, remarks
    )
    SELECT DATEADD(day, numbers.n % 60, CONVERT(date, '20260101', 112)),
            vegetables.name, vegetables.variety, vegetables.category,
            vegetables.prefecture, vegetables.city, vegetables.color,
            N'サンプル生産者' + CONVERT(nvarchar(10), numbers.n % 5 + 1),
            vegetables.unit, vegetables.price + numbers.n % 4 * 10,
            numbers.n % 15 + 1,
            N'サンプル店舗' + CONVERT(nvarchar(10), numbers.n % 3 + 1),
            N'動作確認用のダミーデータ'
    FROM numbers
    INNER JOIN vegetables ON vegetables.id = numbers.n % 10;
END;

COMMIT TRANSACTION;
