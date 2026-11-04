-- SQL Server向け。初期構築用の参照先テーブルを作成する。
-- GOやSQLCMDモードは不要。既存の表とデータは保持する。

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;

USE [{{applicationDatabase}}];

IF SCHEMA_ID(N'{{schema}}') IS NULL
    EXEC sys.sp_executesql N'CREATE SCHEMA [{{schema}}];';

-- 参照データテーブルの定義。現行の16列・型・計算列・主キーを再現する。
IF OBJECT_ID(N'{{schema}}.{{table}}', N'U') IS NULL
BEGIN
    CREATE TABLE {{schema}}.{{table}} (
        sale_id int IDENTITY(1,1) NOT NULL,
        sale_date date NOT NULL,
        vegetable_name nvarchar(50) NOT NULL,
        variety_name nvarchar(50) NOT NULL,
        vegetable_category nvarchar(20) NOT NULL,
        origin_prefecture nvarchar(10) NOT NULL,
        origin_city nvarchar(50) NOT NULL,
        color nvarchar(20) NOT NULL,
        producer_name nvarchar(50) NOT NULL,
        sales_unit nvarchar(10) NOT NULL,
        unit_price decimal(10,2) NOT NULL,
        quantity int NOT NULL,
        sales_amount AS (CONVERT(decimal(18,2), unit_price * quantity)) PERSISTED,
        store_name nvarchar(50) NOT NULL,
        remarks nvarchar(200) NULL,
        created_at datetime2(0) NOT NULL
            CONSTRAINT DF_{{table}}_created_at DEFAULT (SYSDATETIME()),

        CONSTRAINT PK_{{table}} PRIMARY KEY CLUSTERED (sale_id),
        CONSTRAINT CK_{{table}}_unit_price CHECK (unit_price >= 0),
        CONSTRAINT CK_{{table}}_quantity CHECK (quantity > 0)
    );
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'{{schema}}.{{table}}')
      AND name = N'IX_{{table}}_sale_date'
)
    CREATE NONCLUSTERED INDEX IX_{{table}}_sale_date
        ON {{schema}}.{{table}} (sale_date);


USE [{{applicationDevelopmentDatabase}}];

IF SCHEMA_ID(N'{{schema}}') IS NULL
    EXEC sys.sp_executesql N'CREATE SCHEMA [{{schema}}];';

-- 参照データテーブルの定義。現行の16列・型・計算列・主キーを再現する。
IF OBJECT_ID(N'{{schema}}.{{table}}', N'U') IS NULL
BEGIN
    CREATE TABLE {{schema}}.{{table}} (
        sale_id int IDENTITY(1,1) NOT NULL,
        sale_date date NOT NULL,
        vegetable_name nvarchar(50) NOT NULL,
        variety_name nvarchar(50) NOT NULL,
        vegetable_category nvarchar(20) NOT NULL,
        origin_prefecture nvarchar(10) NOT NULL,
        origin_city nvarchar(50) NOT NULL,
        color nvarchar(20) NOT NULL,
        producer_name nvarchar(50) NOT NULL,
        sales_unit nvarchar(10) NOT NULL,
        unit_price decimal(10,2) NOT NULL,
        quantity int NOT NULL,
        sales_amount AS (CONVERT(decimal(18,2), unit_price * quantity)) PERSISTED,
        store_name nvarchar(50) NOT NULL,
        remarks nvarchar(200) NULL,
        created_at datetime2(0) NOT NULL
            CONSTRAINT DF_{{table}}_created_at DEFAULT (SYSDATETIME()),

        CONSTRAINT PK_{{table}} PRIMARY KEY CLUSTERED (sale_id),
        CONSTRAINT CK_{{table}}_unit_price CHECK (unit_price >= 0),
        CONSTRAINT CK_{{table}}_quantity CHECK (quantity > 0)
    );
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'{{schema}}.{{table}}')
      AND name = N'IX_{{table}}_sale_date'
)
    CREATE NONCLUSTERED INDEX IX_{{table}}_sale_date
        ON {{schema}}.{{table}} (sale_date);

