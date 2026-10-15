/* SPDX-License-Identifier: GPL-3.0-or-later */
const definitions = {
  google: {
    engineId: 'google', sourceId: 'online:google', name: 'Google 翻译（实验性）', recipient: 'Google',
    disclosure: '开启后，查询文本会发送给 Google（最多 256 字符、16 个词）；实验性服务可能不可用或限流。',
  },
  bing: {
    engineId: 'bing', sourceId: 'online:bing', name: 'Microsoft 翻译（Edge，实验性）', recipient: 'Microsoft',
    disclosure: '开启后，查询文本会发送给 Microsoft 翻译服务（最多 256 字符、16 个词）；实验性服务可能不可用或限流。',
  },
  youdao: {
    engineId: 'youdao', sourceId: 'online:youdao', name: '有道翻译（网页体验，实验性）', recipient: '有道',
    disclosure: '开启后，查询文本会发送给有道翻译网页体验服务（最多 256 字符、16 个词）；这是体验接口，可能变化或限流。',
  },
  mymemory: {
    engineId: 'mymemory', sourceId: 'online:mymemory', name: 'MyMemory 翻译（英→简中，实验性）', recipient: 'MyMemory',
    disclosure: '开启后，英文查询文本会发送给 MyMemory，固定按英→简中查询（最多 256 字符、16 个词）；不发送邮箱。',
  },
};

export const ONLINE_ENGINE_CATALOG = Object.freeze(Object.fromEntries(
  Object.entries(definitions).map(([id, item]) => [id, Object.freeze(item)]),
));
export const ONLINE_ENGINE_IDS = Object.freeze(Object.keys(ONLINE_ENGINE_CATALOG));
export const MAX_QUERY_SOURCES = 5000 + ONLINE_ENGINE_IDS.length;

export function onlineEngine(engineId) { return ONLINE_ENGINE_CATALOG[engineId]; }

export function defaultOnlineSource(engineId) {
  const definition = onlineEngine(engineId);
  if (!definition) throw new Error('未知在线翻译引擎。');
  return { id: definition.sourceId, kind: 'online', engineId, name: definition.name, enabled: false };
}
