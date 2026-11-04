-- SQL Server向け。01_create_databases.sqlの後にファイル全体を実行する。
-- GOやSQLCMDモードは不要。既存の表とデータは保持する。

-- production: 台帳には-devを付けない基底DB名を登録する。
USE [application_config_db];

-- 開発・本番の初期接続を登録する。再実行しても、既存行の接続先や有効状態は上書きしない。
-- 日時はUTCで保存し、更新する際はupdated_atも更新する。
SET XACT_ABORT ON;
BEGIN TRANSACTION;

INSERT INTO dbo.m_database_connection (
    application_name, environment_name, connection_name, database_name, description
)
SELECT N'vegetables-sale', environment.environment_name, 'application', N'vegetables_maintenance_db',
        N'参照データの閲覧に使用する業務DB'
FROM (VALUES ('production')) AS environment(environment_name)
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.m_database_connection WITH (UPDLOCK, HOLDLOCK)
    WHERE application_name = N'vegetables-sale'
      AND environment_name = environment.environment_name
      AND connection_name = 'application'
);

COMMIT TRANSACTION;


-- development: 台帳には-devを付けない基底DB名を登録する。
USE [application_config_db-dev];

-- 開発・本番の初期接続を登録する。再実行しても、既存行の接続先や有効状態は上書きしない。
-- 日時はUTCで保存し、更新する際はupdated_atも更新する。
SET XACT_ABORT ON;
BEGIN TRANSACTION;

INSERT INTO dbo.m_database_connection (
    application_name, environment_name, connection_name, database_name, description
)
SELECT N'vegetables-sale', environment.environment_name, 'application', N'vegetables_maintenance_db',
        N'参照データの閲覧に使用する業務DB'
FROM (VALUES ('development')) AS environment(environment_name)
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.m_database_connection WITH (UPDLOCK, HOLDLOCK)
    WHERE application_name = N'vegetables-sale'
      AND environment_name = environment.environment_name
      AND connection_name = 'application'
);

COMMIT TRANSACTION;
