/* SPDX-License-Identifier: GPL-3.0-or-later */
import { createGoogleTranslator } from './google-translate.js';
import { createEdgeTranslator } from './edge-translate.js';
import { createYoudaoTranslator } from './youdao-translate.js';
import { createMyMemoryTranslator } from './mymemory-translate.js';
import { ONLINE_ENGINE_IDS } from './online-engine-catalog.js';

export function createOnlineTranslator(Zotero) {
  const engines = new Map([
    ['google', createGoogleTranslator(Zotero)],
    ['bing', createEdgeTranslator(Zotero)],
    ['youdao', createYoudaoTranslator(Zotero)],
    ['mymemory', createMyMemoryTranslator(Zotero)],
  ]);
  return (query, source, scope) => {
    if (!ONLINE_ENGINE_IDS.includes(source?.engineId)) throw Object.assign(new Error('Unsupported online engine'), { code: 'UNSUPPORTED_ENGINE' });
    const translate = engines.get(source?.engineId);
    if (!translate) throw Object.assign(new Error('Unsupported online engine'), { code: 'UNSUPPORTED_ENGINE' });
    return translate(query, source, scope);
  };
}
