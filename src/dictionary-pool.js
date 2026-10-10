/* SPDX-License-Identifier: GPL-3.0-or-later */
import { MDXDictionary } from './mdx.js';
import { StarDictDictionary } from './stardict.js';
import { DSLDictionary } from './dsl.js';
import { dictionaryFormat } from './dictionary-formats.js';

// Keep only a few decoded word indexes. A failed replacement never evicts the
// previous working index; callers commit their active selection after load().
export class DictionaryPool {
  constructor(fs, capacity = 3) { this.fs = fs; this.capacity = capacity; this.cache = new Map(); this.pending = new Map(); this.epoch = 0; }
  async load(path, { reload = false } = {}) {
    if (!reload && this.cache.has(path)) {
      const dictionary = this.cache.get(path); this.cache.delete(path); this.cache.set(path, dictionary); return dictionary;
    }
    if (!reload && this.pending.has(path)) return this.pending.get(path);
    const epoch = this.epoch;
    const guard = () => { if (epoch !== this.epoch) throw new Error('词典读取已取消。'); };
    const pending = (async () => {
      guard(); const stat = await this.fs.stat(path); guard();
      if (stat.type !== 'regular') throw new Error('请选择可读取的 MDX、StarDict .ifo 或 DSL 文件。');
      const format = dictionaryFormat(path); guard(); const started = Date.now();
      const dictionary = format === 'StarDict' ? await StarDictDictionary.open(this.fs, path, guard) : format === 'DSL' ? await DSLDictionary.open(this.fs, path, guard) : await MDXDictionary.open({ size: stat.size, read: async (offset, length) => {
        guard(); const result = await this.fs.read(path, { offset, maxBytes: length }); guard(); return result;
      } });
      dictionary.stats.format = format || 'MDX'; dictionary.stats.indexMs = Date.now() - started;
      guard();
      if (this.pending.get(path) === pending) {
        const previous = this.cache.get(path); if (previous !== dictionary) previous?.clearCache();
        this.cache.delete(path); this.cache.set(path, dictionary);
        while (this.cache.size > this.capacity) {
          const oldest = [...this.cache.keys()].find(key => key !== this.activePath); this.cache.get(oldest).clearCache(); this.cache.delete(oldest);
        }
      }
      return dictionary;
    })();
    this.pending.set(path, pending);
    try { return await pending; } finally { if (this.pending.get(path) === pending) this.pending.delete(path); }
  }
  clear() { this.epoch++; this.pending.clear(); for (const dictionary of this.cache.values()) dictionary.clearCache(); this.cache.clear(); }
}
