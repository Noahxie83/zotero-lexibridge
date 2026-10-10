/* SPDX-License-Identifier: GPL-3.0-or-later */
import { lookupWithForms } from './morphology.js';
export async function queryDictionaries(query, dictionaries, { load, mode = 'single', forms = true, cancelled = () => false } = {}) {
  const paths = new Set(), groups = [], errors = [];
  for (const descriptor of dictionaries) {
    if (cancelled()) break;
    if (paths.has(descriptor.path)) continue; paths.add(descriptor.path);
    try {
      const dictionary = await load(descriptor.path);
      if (cancelled()) break;
      const group = await lookupWithForms(dictionary, query, { forms, cancelled });
      if (cancelled()) break;
      group.warnings = [...new Set(group.results.flatMap(result => result.warnings || []))];
      groups.push({ ...group, path: descriptor.path, name: descriptor.name, stats: dictionary.stats });
      errors.push(...group.errors.map(error => descriptor.name + '：' + error));
      if (mode === 'single' || (mode === 'fallback' && group.results.length)) break;
    } catch (error) { errors.push(descriptor.name + '：' + String(error.message || error)); if (mode === 'single') break; }
  }
  return { groups, errors, results: groups.flatMap(group => group.results.map(result => ({ ...result, dictionaryPath: group.path, dictionaryName: group.name }))) };
}
