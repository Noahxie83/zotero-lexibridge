/* SPDX-License-Identifier: GPL-3.0-or-later */
// Bloom membership: false positives may cost a read, false negatives must never
// discard a resource. Filters survive eviction of the much larger string keys.
function hashes(key) {
  let a = 2166136261, b = 5381;
  for (let i = 0; i < key.length; i++) { const c = key.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b, 33) ^ c; }
  return [a >>> 0, (b | 1) >>> 0];
}
export function createBlockFilter(entries) {
  const words = new Uint32Array(Math.max(8, Math.min(2048, Math.ceil(entries.length * 16 / 32))));
  for (const entry of entries) {
    const [a, b] = hashes(entry.key);
    for (let i = 0; i < 5; i++) { const bit = ((a + Math.imul(i, b)) >>> 0) % (words.length * 32); words[bit >>> 5] |= 1 << (bit & 31); }
  }
  return words;
}
export function blockMayContain(words, key) {
  const [a, b] = hashes(key);
  for (let i = 0; i < 5; i++) { const bit = ((a + Math.imul(i, b)) >>> 0) % (words.length * 32); if (!(words[bit >>> 5] & (1 << (bit & 31)))) return false; }
  return true;
}
