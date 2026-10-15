/* SPDX-License-Identifier: GPL-3.0-or-later */
import { zipSync } from 'fflate';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const omit = new Set(['.git', 'node_modules', 'dist', 'preview', '.preview', '.artifacts']);
const generated = new Set(['addon/content/plugin.js', 'addon/LICENSE', 'addon/THIRD_PARTY.md']);
const files = {};
// A fixed timestamp keeps the archive byte-reproducible for checksum records.
const FIXED_MTIME = Date.UTC(2026, 0, 1);
async function walk(dir, prefix = '') {
  const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const item of entries) {
    const name = prefix + item.name;
    if (/^verification-/.test(item.name) || omit.has(item.name) || generated.has(name) || name.startsWith('addon/licenses/') || name.startsWith('docs/tasks/') || /\.(?:mdx|mdd|ifo|idx(?:\.gz)?|dict(?:\.dz)?|syn|dsl(?:\.dz|\.files)?|xpi|zip)$/i.test(name)) continue;
    if (item.isDirectory()) await walk(path.join(dir, item.name), name + '/');
    else if (item.isFile()) files['zotero-lexibridge/' + name] = [new Uint8Array(await readFile(path.join(dir, item.name))), { mtime: FIXED_MTIME }];
  }
}
await walk(root);
await mkdir(path.join(root, 'dist'), { recursive: true });
const suffix = process.argv.includes('--docs') ? '-docs' : '';
const out = path.join(root, 'dist', `lexibridge-source-${manifest.version}${suffix}.zip`);
await writeFile(out, zipSync(files, { level: 6 }));
console.log(out);
