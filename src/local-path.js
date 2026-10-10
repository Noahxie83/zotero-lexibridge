/* SPDX-License-Identifier: GPL-3.0-or-later */
export const basename = path => path.split(/[\\/]/).pop();
export const dirname = path => {
  const at = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
  return path.slice(0, at === 0 || (at === 2 && /^[a-z]:/i.test(path)) ? at + 1 : at);
};

export function relocatePath(path, replacements) {
  if (!path) return path;
  const normalize = value => value.replace(/\\/g, '/').replace(/\/+$/, '');
  const normalized = path.replace(/\\/g, '/');
  const roots = replacements.map(([from, to]) => [normalize(from), to]).sort((a, b) => b[0].length - a[0].length);
  const match = roots.find(([from]) => normalized === from || normalized.startsWith(from + '/'));
  if (!match) return path;
  if (normalize(path) === match[0]) return match[1];
  const suffix = path.slice(match[0].length);
  const destination = match[1].replace(/[\\/]+$/, '');
  return destination + (suffix || (destination ? '' : match[1]));
}
