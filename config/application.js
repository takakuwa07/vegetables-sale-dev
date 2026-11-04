// コピー先で変わるアプリ固有情報はapplication.jsonで管理する。
// 接続用の資格情報は含めず、envファイルで別途管理する。
import settings from './application.json' with { type: 'json' };
import { databaseNameForEnvironment } from './database-name.js';

// SQLのテンプレートやAPIルートへ渡す設定を、起動前に検証する。
export function validateApplication(value) {
  if (!value || !/^[a-z][a-z0-9_-]{0,99}$/.test(value.id)) {
    throw new Error('アプリ識別子には英小文字・数字・ハイフン・アンダースコアを指定してください');
  }

  for (const name of ['title', 'label', 'version', 'description']) {
    if (typeof value[name] !== 'string' || !value[name].trim()) {
      throw new Error('アプリ設定に必要な項目がありません: ' + name);
    }
  }

  databaseNameForEnvironment(value.configurationDatabase, 'development');
  databaseNameForEnvironment(value.data?.database, 'development');

  for (const name of ['schema', 'table']) {
    const maximum = name === 'table' ? 100 : 128;

    if (typeof value.data[name] !== 'string' || value.data[name].length > maximum || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(value.data[name])) {
      throw new Error('参照先のスキーマ・テーブル名には英数字とアンダースコアを指定してください');
    }
  }

  if (!/^\/api\/[a-z][a-z0-9-]*$/.test(value.data.apiPath)) {
    throw new Error('一覧APIのURLは/api/から始まる単一のルートを指定してください');
  }

  return Object.freeze({ ...value, data: Object.freeze({ ...value.data }) });
}

export default validateApplication(settings);
