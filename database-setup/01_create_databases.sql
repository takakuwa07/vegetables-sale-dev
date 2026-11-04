-- 1. 対象のSQL Serverで最初に実行する。DB作成権限のある接続を使用する。
-- 既存DBは削除・再作成しない。-devを含む名前は必ず角括弧で囲む。
USE [master];

IF DB_ID(N'application_config_db') IS NULL
    EXEC sys.sp_executesql N'CREATE DATABASE [application_config_db];';

IF DB_ID(N'application_config_db-dev') IS NULL
    EXEC sys.sp_executesql N'CREATE DATABASE [application_config_db-dev];';

IF DB_ID(N'vegetables_maintenance_db') IS NULL
    EXEC sys.sp_executesql N'CREATE DATABASE [vegetables_maintenance_db];';

IF DB_ID(N'vegetables_maintenance_db-dev') IS NULL
    EXEC sys.sp_executesql N'CREATE DATABASE [vegetables_maintenance_db-dev];';
