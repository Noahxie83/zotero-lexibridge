/* SPDX-License-Identifier: GPL-3.0-or-later */
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const preferences = (await readFile(path.join(root, 'addon/content/preferences.xhtml'), 'utf8'))
  .replace(/html:/g, '').replace(/ onload="[^"]*"/, '')
  .replace(/<(p|select|div)([^>]*)\/>/g, '<$1$2></$1>');
const template = await readFile(path.join(root, 'examples/interface-preview.html'), 'utf8');
const bundle = await build({ entryPoints: [path.join(root, 'examples/interface-preview.js')], write: false,
  bundle: true, format: 'iife', target: ['firefox140'], legalComments: 'inline' });
const html = template.replace('<!-- PREFERENCES -->', preferences)
  .replace('<!-- SCRIPT -->', '<script>' + bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script') + '</script>');
// This preview contains only original fixtures and browser-only mock callbacks.
const output = path.join(root, 'docs/interface-preview.html');
await writeFile(path.join(root, 'docs/interface-preview.html'), html);
await mkdir(path.join(root, 'dist'), { recursive: true });
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
await writeFile(path.join(root, `dist/lexibridge-ui-${version}.html`), html);
console.log(output);
