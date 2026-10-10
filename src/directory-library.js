/* SPDX-License-Identifier: GPL-3.0-or-later */
import { dictionaryFormat, dictionaryName } from './dictionary-formats.js';
export function folderList(value, fallback = '') {
  try { const paths = JSON.parse(value || '[]'); if (Array.isArray(paths)) return [...new Set(paths.filter(path => typeof path === 'string' && path))].slice(0, 32).concat(paths.length ? [] : fallback ? [fallback] : []); } catch {}
  return fallback ? [fallback] : [];
}
export async function scanDirectories(fs, folders, { recursive = false, cancelled = () => false } = {}) {
  const visited = new Set(), files = new Map(); let inspected = 0;
  const check = () => { if (cancelled()) throw new Error('目录扫描已取消。'); };
  const scan = async (directory, depth) => {
    check(); if (visited.has(directory)) return; visited.add(directory);
    if (depth > 8) throw new Error('递归目录超过 8 层，请选择更具体的词典目录。');
    if ((await fs.stat(directory)).type !== 'directory') throw new Error('词典文件夹不存在：' + directory);
    const children = await fs.getChildren(directory); check();
    for (const path of children) {
      check(); if (++inspected > 50000) throw new Error('目录扫描超过 50000 项，请选择更具体的目录。');
      if (!recursive && !dictionaryFormat(path)) continue;
      const stat = await fs.stat(path); check();
      if (stat.type === 'regular' && dictionaryFormat(path)) files.set(path, { path, name: dictionaryName(path), format: dictionaryFormat(path) });
      else if (recursive && stat.type === 'directory') await scan(path, depth + 1);
    }
  };
  for (const folder of folders) await scan(folder, 0);
  return [...files.values()].sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
}
export function orderedDictionaries(list, orderValue) {
  let order = []; try { order = JSON.parse(orderValue || '[]'); } catch {}
  if (!Array.isArray(order)) order = [];
  const ranks = new Map(order.map((path, index) => [path, index]));
  return list.slice().sort((a, b) => (ranks.get(a.path) ?? Infinity) - (ranks.get(b.path) ?? Infinity));
}
