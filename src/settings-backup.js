/* SPDX-License-Identifier: GPL-3.0-or-later */
import { validVocabulary } from './vocabulary.js';
import { relocatePath } from './local-path.js';
export const SETTING_KEYS = ['enabled', 'selectionEnabled', 'selectionMenu', 'annotationColor', 'path', 'folder', 'directories', 'dictionaryOrder', 'recursive', 'displayMode', 'resources', 'wordForms', 'queryMode', 'vocabulary', 'theme', 'fontSize', 'popupWidth', 'popupHeight', 'pronunciation'];
const enumValues = { selectionMenu: ['integrated', 'native'], displayMode: ['original', 'text'], queryMode: ['single', 'fallback', 'all'], theme: ['original', 'light', 'dark'], pronunciation: ['first', 'uk', 'us'] };
export function validateSettings(backup) {
  if (!backup || !['local-dictionary-settings', 'local-mdx-settings'].includes(backup.format) || backup.version !== 1 || !backup.settings || typeof backup.settings !== 'object' || Array.isArray(backup.settings)) throw new Error('这不是支持的 Local Dictionary 备份。');
  const result = Object.create(null);
  for (const key of SETTING_KEYS) {
    if (!Object.hasOwn(backup.settings, key)) continue;
    const value = backup.settings[key];
    if (['enabled', 'selectionEnabled', 'wordForms', 'recursive'].includes(key)) { if (typeof value !== 'boolean') throw new Error('设置类型无效：' + key); }
    else if (['fontSize', 'popupWidth', 'popupHeight'].includes(key)) {
      const [min, max] = key === 'fontSize' ? [12, 28] : key === 'popupWidth' ? [320, 1000] : [240, 1000];
      if (!Number.isInteger(value) || value < min || value > max) throw new Error('设置范围无效：' + key);
    } else if (typeof value !== 'string' || value.length > 2_000_000) throw new Error('设置类型无效：' + key);
    if (enumValues[key] && !enumValues[key].includes(value)) throw new Error('未知选项：' + key);
    if (['path', 'folder'].includes(key) && (value.length > 2048 || /[\0\r\n]/.test(value))) throw new Error('目录或文件路径无效。');
    if (key === 'annotationColor' && !/^#[\da-f]{6}$/i.test(value)) throw new Error('颜色无效。');
    if (['directories', 'dictionaryOrder'].includes(key)) {
      const paths = JSON.parse(value); if (!Array.isArray(paths) || paths.length > 5000 || paths.some(path => typeof path !== 'string' || path.length > 2048 || /[\0\r\n]/.test(path))) throw new Error('目录列表无效。');
      if (key === 'directories' && paths.length > 32) throw new Error('最多管理 32 个词典目录。');
    }
    if (key === 'resources') {
      const resources = JSON.parse(value); if (!resources || Array.isArray(resources) || typeof resources !== 'object') throw new Error('资源设置无效。');
      for (const [path, config] of Object.entries(resources)) {
        if (path === '__proto__' || !config || typeof config !== 'object' || (config.folder != null && typeof config.folder !== 'string') || (config.extraArchives != null && (!Array.isArray(config.extraArchives) || config.extraArchives.length > 128 || config.extraArchives.some(file => typeof file !== 'string' || file.length > 2048 || /\0/.test(file))))) throw new Error('资源关联无效。');
      }
    }
    if (key === 'vocabulary') {
      if (!validVocabulary(JSON.parse(value))) throw new Error('生词记录无效。');
    }
    result[key] = value;
  }
  return result;
}
export function settingsBackup(get) {
  return JSON.stringify({ format: 'local-dictionary-settings', version: 1, settings: Object.fromEntries(SETTING_KEYS.map(key => [key, get(key)]).filter(([, value]) => value != null)) }, null, 2);
}

// Only dictionary/resource paths move. Saved literature identities must remain
// unchanged: a similarly numbered item in another library is not the source.
export function relocateSettings(settings, replacements) {
  const move = path => relocatePath(path, replacements);
  const result = { ...settings };
  for (const key of ['path', 'folder']) if (result[key]) result[key] = move(result[key]);
  for (const key of ['directories', 'dictionaryOrder']) if (result[key]) result[key] = JSON.stringify(JSON.parse(result[key]).map(move));
  if (result.resources) result.resources = JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(result.resources)).map(([path, config]) => [move(path), {
    ...config, ...(config.folder ? { folder: move(config.folder) } : {}),
    ...(config.extraArchives ? { extraArchives: config.extraArchives.map(move) } : {}),
  }])));
  return result;
}
