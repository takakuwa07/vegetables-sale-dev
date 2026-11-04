-- SQL Server向け。01_create_databases.sqlの後にファイル全体を実行する。
-- GOやSQLCMDモードは不要。既存の表とデータは保持する。

-- production
USE [{{configurationDatabase}}];

-- 旧cfgテーブルをマスタの接頭語mへ変更する。データのコピー・削除は行わない。
-- 新旧が両方ある場合は勝手に統合せず、状態を確認できるように停止する。
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.cfg_database_connection', N'U') IS NOT NULL
    BEGIN
        IF OBJECT_ID(N'dbo.m_database_connection') IS NOT NULL
            THROW 50001, N'接続先台帳の新旧テーブルが両方あります。移行前に確認してください。', 1;

        EXEC sys.sp_rename N'dbo.cfg_database_connection', N'm_database_connection', N'OBJECT';
    END;

    -- 主キー・既定値・CHECK制約の名前もそろえる。主キーの索引名も同時に変わる。
    DECLARE @oldName_production sysname, @newName_production sysname, @qualifiedName_production nvarchar(260);
    DECLARE constraints_to_rename_production CURSOR LOCAL FAST_FORWARD FOR
        SELECT name, REPLACE(name, N'_cfg_database_connection', N'_m_database_connection')
        FROM sys.objects
        WHERE parent_object_id = OBJECT_ID(N'dbo.m_database_connection', N'U')
          AND type IN ('PK', 'D', 'C')
          AND name LIKE N'%[_]cfg[_]database[_]connection%';

    OPEN constraints_to_rename_production;
    FETCH NEXT FROM constraints_to_rename_production INTO @oldName_production, @newName_production;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        SET @qualifiedName_production = N'dbo.' + QUOTENAME(@oldName_production);
        EXEC sys.sp_rename @qualifiedName_production, @newName_production, N'OBJECT';
        FETCH NEXT FROM constraints_to_rename_production INTO @oldName_production, @newName_production;
    END;

    CLOSE constraints_to_rename_production;
    DEALLOCATE constraints_to_rename_production;
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;

-- アプリ・実行環境・接続名の組み合わせで業務DBの接続先を管理する。
-- 資格情報は登録せず、接続ユーザーやパスワードは各PCのenvファイルで管理する。
IF OBJECT_ID(N'dbo.m_database_connection', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.m_database_connection (
        application_name nvarchar(100) NOT NULL,
        environment_name varchar(20) NOT NULL,
        connection_name varchar(64) NOT NULL,
        database_name sysname NOT NULL,
        is_enabled bit NOT NULL
            CONSTRAINT DF_m_database_connection_enabled DEFAULT (1),
        description nvarchar(200) NULL,
        created_at datetime2(3) NOT NULL
            CONSTRAINT DF_m_database_connection_created DEFAULT (SYSUTCDATETIME()),
        updated_at datetime2(3) NOT NULL
            CONSTRAINT DF_m_database_connection_updated DEFAULT (SYSUTCDATETIME()),

        CONSTRAINT PK_m_database_connection
            PRIMARY KEY (application_name, environment_name, connection_name),
        CONSTRAINT CK_m_database_connection_environment
            CHECK (environment_name IN ('development', 'production')),
        CONSTRAINT CK_m_database_connection_reserved_name
            CHECK (connection_name <> 'configuration'),
        CONSTRAINT CK_m_database_connection_application
            CHECK (LEN(application_name) > 0),
        CONSTRAINT CK_m_database_connection_database
            CHECK (LEN(database_name) > 0)
    );
END;


-- development
USE [{{configurationDevelopmentDatabase}}];

-- 旧cfgテーブルをマスタの接頭語mへ変更する。データのコピー・削除は行わない。
-- 新旧が両方ある場合は勝手に統合せず、状態を確認できるように停止する。
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.cfg_database_connection', N'U') IS NOT NULL
    BEGIN
        IF OBJECT_ID(N'dbo.m_database_connection') IS NOT NULL
            THROW 50001, N'接続先台帳の新旧テーブルが両方あります。移行前に確認してください。', 1;

        EXEC sys.sp_rename N'dbo.cfg_database_connection', N'm_database_connection', N'OBJECT';
    END;

    -- 主キー・既定値・CHECK制約の名前もそろえる。主キーの索引名も同時に変わる。
    DECLARE @oldName_development sysname, @newName_development sysname, @qualifiedName_development nvarchar(260);
    DECLARE constraints_to_rename_development CURSOR LOCAL FAST_FORWARD FOR
        SELECT name, REPLACE(name, N'_cfg_database_connection', N'_m_database_connection')
        FROM sys.objects
        WHERE parent_object_id = OBJECT_ID(N'dbo.m_database_connection', N'U')
          AND type IN ('PK', 'D', 'C')
          AND name LIKE N'%[_]cfg[_]database[_]connection%';

    OPEN constraints_to_rename_development;
    FETCH NEXT FROM constraints_to_rename_development INTO @oldName_development, @newName_development;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        SET @qualifiedName_development = N'dbo.' + QUOTENAME(@oldName_development);
        EXEC sys.sp_rename @qualifiedName_development, @newName_development, N'OBJECT';
        FETCH NEXT FROM constraints_to_rename_development INTO @oldName_development, @newName_development;
    END;

    CLOSE constraints_to_rename_development;
    DEALLOCATE constraints_to_rename_development;
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;

-- アプリ・実行環境・接続名の組み合わせで業務DBの接続先を管理する。
-- 資格情報は登録せず、接続ユーザーやパスワードは各PCのenvファイルで管理する。
IF OBJECT_ID(N'dbo.m_database_connection', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.m_database_connection (
        application_name nvarchar(100) NOT NULL,
        environment_name varchar(20) NOT NULL,
        connection_name varchar(64) NOT NULL,
        database_name sysname NOT NULL,
        is_enabled bit NOT NULL
            CONSTRAINT DF_m_database_connection_enabled DEFAULT (1),
        description nvarchar(200) NULL,
        created_at datetime2(3) NOT NULL
            CONSTRAINT DF_m_database_connection_created DEFAULT (SYSUTCDATETIME()),
        updated_at datetime2(3) NOT NULL
            CONSTRAINT DF_m_database_connection_updated DEFAULT (SYSUTCDATETIME()),

        CONSTRAINT PK_m_database_connection
            PRIMARY KEY (application_name, environment_name, connection_name),
        CONSTRAINT CK_m_database_connection_environment
            CHECK (environment_name IN ('development', 'production')),
        CONSTRAINT CK_m_database_connection_reserved_name
            CHECK (connection_name <> 'configuration'),
        CONSTRAINT CK_m_database_connection_application
            CHECK (LEN(application_name) > 0),
        CONSTRAINT CK_m_database_connection_database
            CHECK (LEN(database_name) > 0)
    );
END;

