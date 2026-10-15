/* SPDX-License-Identifier: GPL-3.0-or-later */
import { MDXDictionary } from './mdx.js';
import { StarDictDictionary } from './stardict.js';
import { DSLDictionary } from './dsl.js';
import { dictionaryFormat } from './dictionary-formats.js';

// Keep only a few decoded word indexes. A failed replacement never evicts the
// previous working index; callers commit their active selection after load().
export class DictionaryPool {
  constructor(fs, capacity = 3) { this.fs = fs; this.capacity = capacity; this.cache = new Map(); this.pending = new Map(); this.epoch = 0; this.leases = new Map(); this.retired = new Map(); }
  evict() {
    while (this.cache.size > this.capacity) {
      const oldest = [...this.cache.keys()].find(key => key !== this.activePath && !this.leases.get(key));
      if (oldest === undefined) break;
      this.cache.get(oldest).clearCache(); this.cache.delete(oldest);
    }
  }
  async acquire(path) {
    const epoch = this.epoch;
    this.leases.set(path, (this.leases.get(path) || 0) + 1);
    let released = false;
    const release = () => {
      if (released) return; released = true;
      if (epoch !== this.epoch) return;
      const count = (this.leases.get(path) || 1) - 1;
      if (count) this.leases.set(path, count); else {
        this.leases.delete(path); this.retired.get(path)?.clearCache(); this.retired.delete(path);
      }
      this.evict();
    };
    try { const dictionary = await this.load(path); return { dictionary, release }; }
    catch (error) { release(); throw error; }
  }
  async load(path, { reload = false } = {}) {
    // At most one retired index per leased path; repeated refreshes coalesce
    // until users of the previous index finish.
    if (reload && this.leases.get(path) && this.retired.has(path) && this.cache.has(path)) return this.cache.get(path);
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
        const previous = this.cache.get(path);
        if (previous && previous !== dictionary) {
          if (this.leases.get(path)) this.retired.set(path, previous); else previous.clearCache();
        }
        this.cache.delete(path); this.cache.set(path, dictionary);
        this.evict();
      }
      return dictionary;
    })();
    this.pending.set(path, pending);
    try { return await pending; } finally { if (this.pending.get(path) === pending) this.pending.delete(path); }
  }
  clear() { this.epoch++; this.leases.clear(); this.pending.clear(); for (const dictionary of [...this.cache.values(), ...this.retired.values()]) dictionary.clearCache(); this.cache.clear(); this.retired.clear(); }
}
