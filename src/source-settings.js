/* SPDX-License-Identifier: GPL-3.0-or-later */
import { defaultOnlineSource, MAX_QUERY_SOURCES, ONLINE_ENGINE_IDS } from './online-engine-catalog.js';
const validPath = value => typeof value === 'string' && value.length > 0 && value.length <= 2048 && !/[\0\r\n]/.test(value);
const validID = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 2200;

export function validateSources(value) {
  if (!Array.isArray(value) || value.length > MAX_QUERY_SOURCES) throw new Error('查询来源列表无效。');
  const ids = new Set(), paths = new Set(), engines = new Set();
  return Array.from(value, source => {
    if (!source || typeof source !== 'object' || Array.isArray(source) ||
      !validID(source.id) || ids.has(source.id) || typeof source.name !== 'string' || typeof source.enabled !== 'boolean') throw new Error('查询来源设置无效。');
    const keys = source.kind === 'local' ? ['id', 'kind', 'path', 'name', 'enabled'] : ['id', 'kind', 'engineId', 'name', 'enabled'];
    if (Object.keys(source).length !== keys.length || keys.some(key => !Object.hasOwn(source, key)) || Object.keys(source).some(key => !keys.includes(key))) throw new Error('查询来源字段无效。');
    ids.add(source.id);
    if (source.kind === 'local') {
      if (!validPath(source.path) || paths.has(source.path)) throw new Error('本地查询来源路径无效或重复。');
      paths.add(source.path);
      return { id: source.id, kind: 'local', path: source.path, name: source.name, enabled: source.enabled };
    }
    if (source.kind !== 'online' || !ONLINE_ENGINE_IDS.includes(source.engineId) || engines.has(source.engineId)) throw new Error('在线查询引擎未知或重复。');
    engines.add(source.engineId);
    return { id: source.id, kind: 'online', engineId: source.engineId, name: source.name, enabled: source.enabled };
  });
}

export function resolveSources(raw, dictionaries) {
  const configured = validateSources(raw == null || raw === '' ? [] : typeof raw === 'string' ? JSON.parse(raw) : raw);
  const scanned = new Map();
  for (const dictionary of dictionaries) {
    if (!dictionary || !validPath(dictionary.path) || typeof dictionary.name !== 'string') throw new Error('扫描到的词典信息无效。');
    if (!scanned.has(dictionary.path)) scanned.set(dictionary.path, dictionary);
  }
  const result = configured.filter(source => source.kind === 'online' || scanned.has(source.path)).map(source => {
    if (source.kind === 'online') return source;
    const dictionary = scanned.get(source.path); scanned.delete(source.path);
    return { ...source, name: dictionary.name };
  });
  const ids = new Set(result.map(source => source.id));
  const uniqueID = base => {
    let id = base, suffix = 1;
    while (ids.has(id)) id = base + ':' + suffix++;
    ids.add(id); return id;
  };
  for (const dictionary of scanned.values()) result.push({ id: uniqueID('local:' + dictionary.path), kind: 'local', path: dictionary.path, name: dictionary.name, enabled: true });
  for (const engineId of ONLINE_ENGINE_IDS) {
    if (!result.some(source => source.kind === 'online' && source.engineId === engineId)) {
      const source = defaultOnlineSource(engineId);
      result.push({ ...source, id: uniqueID(source.id) });
    }
  }
  return validateSources(result);
}
