/* SPDX-License-Identifier: GPL-3.0-or-later */
export function editDistance(a, b, limit = 2) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i]; let min = i;
    for (let j = 1; j <= b.length; j++) { row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); min = Math.min(min, row[j]); }
    if (min > limit) return limit + 1; previous = row;
  }
  return previous[b.length];
}
export async function spellingSuggestions(dictionary, word, { cancelled = () => false, yieldControl, limit = 5 } = {}) {
  if (!/^[a-z]{3,40}$/i.test(word)) return [];
  const target = word.toLowerCase(), nearby = dictionary.browseWords(target[0], 0, 8000).words;
  const candidates = [...new Set([...nearby, ...dictionary.browseWords('', 0, 2000).words])], scores = [];
  for (let i = 0; i < candidates.length; i++) {
    if (cancelled()) return [];
    const candidate = candidates[i], score = editDistance(target, candidate.toLowerCase());
    if (score > 0 && score <= 2) scores.push({ candidate, score });
    if (yieldControl && i % 256 === 0) await yieldControl();
  }
  return scores.sort((a, b) => a.score - b.score || a.candidate.localeCompare(b.candidate)).slice(0, limit).map(row => row.candidate);
}
