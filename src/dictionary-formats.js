/* SPDX-License-Identifier: GPL-3.0-or-later */
export function dictionaryFormat(path) {
  if (/\.mdx$/i.test(path)) return 'MDX';
  if (/\.ifo$/i.test(path)) return 'StarDict';
  if (/\.dsl(?:\.dz)?$/i.test(path)) return 'DSL';
  return '';
}
export const dictionaryName = path => path.split(/[\\/]/).pop().replace(/\.(?:mdx|ifo|dsl(?:\.dz)?)$/i, '');
