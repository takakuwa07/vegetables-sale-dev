-- 接続設定専用DBから、アプリ名・実行環境に一致する有効な接続だけを取得する。
SELECT connection.connection_name, connection.database_name
FROM dbo.m_database_connection AS connection
WHERE connection.application_name = @applicationName
  AND connection.environment_name = @environmentName
  AND connection.is_enabled = 1
ORDER BY connection.connection_name;
