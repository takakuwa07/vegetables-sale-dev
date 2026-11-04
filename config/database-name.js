// envと接続先台帳には基底DB名を登録し、実行環境に応じて実際の接続先名を決める。
// 開発は必ず-dev、本番は必ず接尾語なしにそろえ、開発DBがない場合の本番への代替は行わない。
export function databaseNameForEnvironment(name, environment) {
  if (!['development', 'production'].includes(environment)) {
    throw new Error('DB名を決める実行環境が不正です');
  }

  const base = typeof name === 'string' && name.endsWith('-dev') ? name.slice(0, -4) : name;

  if (typeof base !== 'string' || !/^[a-z][a-z0-9_]*$/.test(base)) {
    throw new Error('DB名には英小文字から始まる英小文字・数字・アンダースコアの基底名を指定してください');
  }

  if (base === 'common_db') {
    throw new Error('旧共通DBは使用できません。専用のDBを指定してください');
  }

  const database = environment === 'development' ? base + '-dev' : base;

  if (database.length > 128) {
    throw new Error('DB名は接尾語を含めて128文字以内で指定してください');
  }

  return database;
}
