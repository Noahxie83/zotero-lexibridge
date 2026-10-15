import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueryScope, querySources } from '../src/query-sources.js';
import { createEdgeTranslator } from '../src/edge-translate.js';
import { createOnlineTranslator } from '../src/online-translators.js';

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const query = text => ({ text, translationText: text, candidates: [text], source: 'manual' });
const bing = { id: 'online:bing', kind: 'online', engineId: 'bing', name: 'Microsoft 翻译（Edge，实验性）', enabled: true };
const google = { id: 'online:google', kind: 'online', engineId: 'google', name: 'Google', enabled: true };
const edgeBody = (text = '你好') => JSON.stringify([{ translations: [{ text, to: 'zh-Hans' }], detectedLanguage: { language: 'en', score: 1 }, to: 'zh-Hans' }]);

test('Microsoft Edge posts bounded text as JSON and returns a typed pure-text translation', async () => {
  let seen;
  const Zotero = { HTTP: { request: async (method, url, options) => {
    seen = { method, url, options };
    return { status: 200, responseText: edgeBody('你好，世界！') };
  } } };
  const result = await createEdgeTranslator(Zotero)(query('Hello, world!'), bing, createQueryScope());
  assert.equal(seen.method, 'POST');
  assert.equal(seen.url, 'https://edge.microsoft.com/translate/translatetext?to=zh-Hans&isEnterpriseClient=false');
  assert.deepEqual(JSON.parse(seen.options.body), ['Hello, world!']);
  assert.equal(seen.options.headers['Content-Type'], 'application/json');
  assert.equal(seen.options.errorDelayMax, 0); assert.equal(seen.options.noRetryOnThrottle, true);
  assert.equal(seen.options.anon, true);
  assert.deepEqual(result, [{ type: 'online', sourceId: bing.id, text: '你好，世界！', engineId: 'bing', sourceLanguage: 'en', targetLanguage: 'zh-Hans' }]);
});

test('Microsoft response validation rejects errors, malformed structures, wrong targets and oversized text', async () => {
  const invalid = [
    '{}', 'not json', JSON.stringify([{ error: { message: 'this is not a translation' } }]),
    JSON.stringify([{ translations: [{ text: '你好' }], to: 'en' }]),
    JSON.stringify([{ translations: [{ text: '你好', to: 'en' }], to: 'zh-Hans' }]),
    JSON.stringify([{ translations: [{ text: '' }], to: 'zh-Hans' }]),
    edgeBody('x'.repeat(32769)), 'x'.repeat(262145),
  ];
  for (const body of invalid) {
    const translate = createEdgeTranslator({ HTTP: { request: async () => ({ status: 200, responseText: body }) } });
    await assert.rejects(translate(query('hello'), bing, createQueryScope()), error => error.code === 'MALFORMED_RESPONSE');
  }
  const httpFailure = createEdgeTranslator({ HTTP: { request: async () => ({ status: 503, responseText: edgeBody('do not show') }) } });
  await assert.rejects(httpFailure(query('hello'), bing, createQueryScope()), error => error.code === 'HTTP_ERROR');
});

test('Microsoft accepts the live response shape when target language is on the translation item', async () => {
  const body = JSON.stringify([{ detectedLanguage: { language: 'en', score: 0.9 }, translations: [{ text: '你好，世界！', to: 'zh-Hans' }] }]);
  const translate = createEdgeTranslator({ HTTP: { request: async () => ({ status: 200, responseText: body }) } });
  assert.deepEqual(await translate(query('Hello, world!'), bing, createQueryScope()), [
    { type: 'online', sourceId: bing.id, text: '你好，世界！', engineId: 'bing', sourceLanguage: 'en', targetLanguage: 'zh-Hans' },
  ]);
});

test('Microsoft cancellation aborts observed and late-observed XHRs and releases the shared online lane', async () => {
  const scope = createQueryScope(), pending = deferred(); let observer, aborted = 0;
  const Zotero = { HTTP: { request: (_method, _url, options) => { observer = options.requestObserver; return pending.promise; } } };
  const translate = createEdgeTranslator(Zotero);
  const task = querySources(query('hello'), [bing], { scope, translate }); await flush(); scope.cancel(); await task;
  observer({ abort: () => aborted++ }); assert.equal(aborted, 1);
  const next = await querySources(query('word'), [bing], { translate: async () => [{ text: '词', engineId: 'bing' }] });
  assert.equal(next.results[0].engineId, 'bing'); pending.resolve({ status: 200, responseText: edgeBody() }); await flush();
});

test('Microsoft watchdog aborts timed-out XHR while leaving no retry attempt', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = deferred(); let aborted = 0, calls = 0;
  const translate = createEdgeTranslator({ HTTP: { request: (_method, _url, options) => { calls++; options.requestObserver({ abort: () => aborted++ }); return pending.promise; } } }, { timeout: 250 });
  const rejected = assert.rejects(translate(query('hello'), bing, createQueryScope()), error => error.code === 'TIMEOUT');
  t.mock.timers.tick(250); await rejected;
  assert.equal(aborted, 1); assert.equal(calls, 1); pending.resolve({ status: 200, responseText: edgeBody() }); await flush();
});

test('Microsoft 429 cools down only Microsoft; Google still dispatches and both results retain engine IDs', async () => {
  let clock = 50000, edgeCalls = 0, googleCalls = 0;
  const Zotero = { HTTP: { request: async () => { edgeCalls++; throw Object.assign(Error('limited'), { status: 429, xmlhttp: { getResponseHeader: () => '5' } }); } } };
  const edge = createEdgeTranslator(Zotero, { now: () => clock });
  const first = await querySources(query('hello'), [bing], { translate: edge });
  assert.equal(first.groups[0].status, 'cooldown'); assert.equal(first.groups[0].retryAt, 55000); assert.equal(edgeCalls, 1);
  const noRepeat = await querySources(query('hello'), [bing], { translate: edge });
  assert.equal(noRepeat.groups[0].status, 'cooldown'); assert.equal(edgeCalls, 1);
  Zotero.HTTP.request = async (_method, url) => {
    if (url.startsWith('https://translate.googleapis.com/')) { googleCalls++; return { status: 200, responseText: JSON.stringify([[['你好']], null, 'en']) }; }
    throw Error('unexpected request');
  };
  const dispatch = createOnlineTranslator(Zotero);
  const googleResult = await querySources(query('hello'), [google], { translate: dispatch });
  assert.equal(googleResult.results[0].engineId, 'google'); assert.equal(googleCalls, 1);
  clock += 10000;
  Zotero.HTTP.request = async () => ({ status: 200, responseText: edgeBody('词') });
  assert.equal((await edge(query('hello'), bing, createQueryScope()))[0].engineId, 'bing');
});

test('Engine dispatch never falls back when Microsoft fails and ignores invalid result attribution', async () => {
  let calls = [];
  const Zotero = { HTTP: { request: async () => { calls.push('bing'); throw Error('offline'); } } };
  const dispatch = createOnlineTranslator(Zotero);
  const result = await querySources(query('hello'), [bing], { translate: dispatch });
  assert.deepEqual(calls, ['bing']); assert.equal(result.groups[0].status, 'error'); assert.equal(result.results.length, 0);
  const healthy = createOnlineTranslator({ HTTP: { request: async (method, url, options) => {
    assert.equal(method, 'POST'); assert.equal(options.anon, true); calls.push(url);
    return { status: 200, responseText: edgeBody('你好') };
  } } });
  const translated = await querySources(query('hello'), [bing], { translate: healthy });
  assert.equal(translated.results[0].engineId, 'bing'); assert.equal(translated.results[0].text, '你好');
  assert.match(calls.at(-1), /^https:\/\/edge\.microsoft\.com\/translate\/translatetext/);
  const invalid = await querySources(query('hello'), [bing], { translate: async () => [{ text: 'Google fallback', engineId: 'google' }] });
  assert.equal(invalid.groups[0].status, 'error'); assert.equal(invalid.results.length, 0);
});
