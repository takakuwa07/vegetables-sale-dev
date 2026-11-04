-- 作成後の件数と接続先を確認する。実際の参照データ行は出力しない。
SELECT N'production' AS environment_name, N'{{configurationDatabase}}' AS database_name,
        application_name, connection_name, database_name AS target_database_base_name, is_enabled
FROM [{{configurationDatabase}}].dbo.m_database_connection
WHERE application_name = N'{{applicationId}}' AND environment_name = 'production';

SELECT N'development' AS environment_name, N'{{configurationDevelopmentDatabase}}' AS database_name,
        application_name, connection_name, database_name AS target_database_base_name, is_enabled
FROM [{{configurationDevelopmentDatabase}}].dbo.m_database_connection
WHERE application_name = N'{{applicationId}}' AND environment_name = 'development';

SELECT N'production' AS environment_name, N'{{applicationDatabase}}' AS database_name, COUNT_BIG(*) AS row_count
FROM [{{applicationDatabase}}].{{schema}}.{{table}}
UNION ALL
SELECT N'development', N'{{applicationDevelopmentDatabase}}', COUNT_BIG(*)
FROM [{{applicationDevelopmentDatabase}}].{{schema}}.{{table}};
