-- 作成後の件数と接続先を確認する。実際の参照データ行は出力しない。
SELECT N'production' AS environment_name, N'application_config_db' AS database_name,
        application_name, connection_name, database_name AS target_database_base_name, is_enabled
FROM [application_config_db].dbo.m_database_connection
WHERE application_name = N'vegetables-sale' AND environment_name = 'production';

SELECT N'development' AS environment_name, N'application_config_db-dev' AS database_name,
        application_name, connection_name, database_name AS target_database_base_name, is_enabled
FROM [application_config_db-dev].dbo.m_database_connection
WHERE application_name = N'vegetables-sale' AND environment_name = 'development';

SELECT N'production' AS environment_name, N'vegetables_maintenance_db' AS database_name, COUNT_BIG(*) AS row_count
FROM [vegetables_maintenance_db].dbo.t_vegetable_sales
UNION ALL
SELECT N'development', N'vegetables_maintenance_db-dev', COUNT_BIG(*)
FROM [vegetables_maintenance_db-dev].dbo.t_vegetable_sales;
