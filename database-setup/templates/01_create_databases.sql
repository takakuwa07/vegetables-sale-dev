-- 1. 対象のSQL Serverで最初に実行する。DB作成権限のある接続を使用する。
-- 既存DBは削除・再作成しない。-devを含む名前は必ず角括弧で囲む。
USE [master];

IF DB_ID(N'{{configurationDatabase}}') IS NULL
    EXEC sys.sp_executesql N'CREATE DATABASE [{{configurationDatabase}}];';

IF DB_ID(N'{{configurationDevelopmentDatabase}}') IS NULL
    EXEC sys.sp_executesql N'CREATE DATABASE [{{configurationDevelopmentDatabase}}];';

IF DB_ID(N'{{applicationDatabase}}') IS NULL
    EXEC sys.sp_executesql N'CREATE DATABASE [{{applicationDatabase}}];';

IF DB_ID(N'{{applicationDevelopmentDatabase}}') IS NULL
    EXEC sys.sp_executesql N'CREATE DATABASE [{{applicationDevelopmentDatabase}}];';
