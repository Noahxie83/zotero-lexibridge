/* SPDX-License-Identifier: GPL-3.0-or-later */
const irregular = {
  am: ['be'], is: ['be'], are: ['be'], was: ['be'], were: ['be'], been: ['be'], being: ['be'],
  went: ['go'], gone: ['go'], did: ['do'], done: ['do'], had: ['have'], has: ['have'],
  made: ['make'], took: ['take'], taken: ['take'], came: ['come'], seen: ['see'], saw: ['see'],
  found: ['find'], thought: ['think'], bought: ['buy'], brought: ['bring'], wrote: ['write'], written: ['write'],
  knew: ['know'], known: ['know'], gave: ['give'], given: ['give'], got: ['get'], gotten: ['get'],
  ran: ['run'], said: ['say'], told: ['tell'], felt: ['feel'], kept: ['keep'], left: ['leave'],
  better: ['good', 'well'], best: ['good', 'well'], worse: ['bad'], worst: ['bad'],
  children: ['child'], men: ['man'], women: ['woman'], mice: ['mouse'], feet: ['foot'], teeth: ['tooth'],
  analyses: ['analysis'], axes: ['axis', 'axe'], indices: ['index'], matrices: ['matrix'], criteria: ['criterion'],
  phenomena: ['phenomenon'], data: ['datum'], people: ['person'],
};
export function wordForms(value) {
  const word = String(value).toLowerCase();
  if (!/^[a-z]{2,64}$/.test(word)) return [];
  const forms = [...(irregular[word] || [])];
  const add = candidate => { if (candidate.length >= 2 && candidate !== word && !forms.includes(candidate)) forms.push(candidate); };
  if (/ies$/.test(word)) add(word.slice(0, -3) + 'y');
  if (/ied$/.test(word)) add(word.slice(0, -3) + 'y');
  if (/ves$/.test(word)) { add(word.slice(0, -3) + 'f'); add(word.slice(0, -3) + 'fe'); }
  if (/(?:ches|shes|xes|zes|sses|oes)$/.test(word)) add(word.slice(0, -2));
  if (word.endsWith('s') && !/(ss|us|is)$/.test(word)) add(word.slice(0, -1));
  for (const suffix of ['ing', 'ed']) {
    if (word.length <= suffix.length + 2 || !word.endsWith(suffix)) continue;
    const base = word.slice(0, -suffix.length); add(base); add(base + 'e');
    if (/([b-df-hj-np-tv-z])\1$/.test(base)) add(base.slice(0, -1));
    if (base.endsWith('y') && suffix === 'ing') add(base.slice(0, -1) + 'ie');
  }
  return forms.slice(0, 8);
}

export async function lookupWithForms(dictionary, query, { forms = true, cancelled = () => false } = {}) {
  const results = new Map(), attempts = [], errors = [];
  const lookup = async (candidate, kind) => {
    if (cancelled()) return;
    try {
      const found = await dictionary.lookup(candidate);
      if (cancelled()) return;
      attempts.push({ word: candidate, kind, found: found.length > 0 });
      for (const entry of found) {
        const key = entry.headword + '\0' + entry.html;
        const previous = results.get(key);
        if (previous) { if (!previous.matches.includes(candidate)) previous.matches.push(candidate); }
        else results.set(key, { ...entry, matches: [candidate], kind });
      }
    } catch (error) { errors.push(candidate + '：' + String(error.message || error)); }
  };
  for (const candidate of query.candidates) await lookup(candidate, 'original');
  // Exact dictionary hits always win, including aliases and real compounds.
  if (!results.size && forms && query.source !== 'entry' && !cancelled()) {
    const alternatives = [...new Set(query.candidates.flatMap(wordForms))].filter(word => !query.candidates.includes(word)).slice(0, 8);
    for (const candidate of alternatives) await lookup(candidate, 'form');
  }
  return { results: [...results.values()], attempts, errors };
}
