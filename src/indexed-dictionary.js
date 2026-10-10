/* SPDX-License-Identifier: GPL-3.0-or-later */
export const normalizedWord = word => word.normalize('NFC').trim().toLowerCase();
export class IndexedDictionary {
  constructor() { this.keys = new Map(); this.displayKeys = new Map(); this.warnings = new Set(); this.count = 0; }
  addKey(word, entry) {
    const key = normalizedWord(word); if (!key) return;
    if (!this.keys.has(key)) { this.keys.set(key, []); this.displayKeys.set(key, word); }
    const rows = this.keys.get(key); if (!rows.includes(entry)) rows.push(entry);
  }
  entriesFor(word) {
    const rows = this.keys.get(normalizedWord(word)) || [], exact = rows.filter(row => row.headword.normalize('NFC') === word.normalize('NFC'));
    return exact.length ? exact : rows;
  }
  browseWords(prefix = '', offset = 0, limit = 30) {
    this.sorted ||= [...this.keys.keys()].sort(); const key = normalizedWord(String(prefix).slice(0, 256));
    let lo = 0, hi = this.sorted.length; while (lo < hi) { const mid = (lo + hi) >>> 1; if (this.sorted[mid] < key) lo = mid + 1; else hi = mid; }
    let at = lo + Math.max(0, Math.floor(Number(offset)) || 0); const size = Math.min(8000, Math.max(1, Math.floor(Number(limit)) || 30)), words = [];
    for (; at < this.sorted.length && this.sorted[at].startsWith(key) && words.length < size; at++) words.push(this.displayKeys.get(this.sorted[at]));
    return { words, more: at < this.sorted.length && this.sorted[at].startsWith(key) };
  }
  clearCache() { this.data?.clearCache?.(); }
}
