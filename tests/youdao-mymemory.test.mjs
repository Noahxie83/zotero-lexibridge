import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueryScope, querySources } from '../src/query-sources.js';
import { createYoudaoTranslator } from '../src/youdao-translate.js';
import { createMyMemoryTranslator } from '../src/mymemory-translate.js';
import { createOnlineTranslator } from '../src/online-translators.js';
import { defaultOnlineSource, MAX_QUERY_SOURCES, ONLINE_ENGINE_IDS } from '../src/online-engine-catalog.js';
import { resolveSources } from '../src/source-settings.js';

const youdao = { ...defaultOnlineSource('youdao'), enabled: true };
const mymemory = { ...defaultOnlineSource('mymemory'), enabled: true };
const google = { ...defaultOnlineSource('google'), enabled: true };
const bing = { ...defaultOnlineSource('bing'), enabled: true };
const query = translationText => ({ translationText });
const body = (status, value) => ({ status, responseText: JSON.stringify(value) });
const youdaoResponse = (translation = '你好！') => ({ errorCode: '0', from: 'en', to: 'zh-CHS', translation: [translation] });
const mymemoryResponse = (translation = '你好！') => ({ responseStatus: 200, quotaFinished: false, responseData: { translatedText: translation, match: 1 } });
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const flush = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };

test('Engine catalog centralizes independent disabled defaults, disclosure, supported IDs and expanded source limit', () => {
  assert.deepEqual(ONLINE_ENGINE_IDS, ['google', 'bing', 'youdao', 'mymemory']);
  assert.equal(MAX_QUERY_SOURCES, 5004);
  for (const engineId of ['youdao', 'mymemory']) {
    const source = defaultOnlineSource(engineId);
    assert.equal(source.enabled, false);
    assert.equal(source.id, 'online:' + engineId);
    assert.ok(source.name && ONLINE_ENGINE_IDS.includes(source.engineId));
  }
});

test('Youdao uses the anonymous form endpoint and returns only its own bounded text result', async () => {
  let seen;
  const Zotero = { HTTP: { request: async (method, url, options) => { seen = { method, url, options }; return body(200, youdaoResponse()); } } };
  const result = await createYoudaoTranslator(Zotero)(query('Hello, world!'), youdao, createQueryScope());
  const form = new URLSearchParams(seen.options.body);
  assert.equal(seen.method, 'POST'); assert.equal(seen.url, 'https://aidemo.youdao.com/trans');
  assert.equal(seen.options.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(form.get('from'), 'auto'); assert.equal(form.get('to'), 'zh-CHS'); assert.equal(form.get('q'), 'Hello, world!');
  assert.equal(seen.options.anon, true); assert.equal(seen.options.errorDelayMax, 0); assert.equal(seen.options.noRetryOnThrottle, true);
  assert.deepEqual(result, [{ type: 'online', sourceId: youdao.id, text: '你好！', engineId: 'youdao', sourceLanguage: 'en', targetLanguage: 'zh-CHS' }]);
});

test('Youdao rejects HTTP, malformed and nonzero business responses without exposing response text', async () => {
  for (const status of [undefined, 0, 429, 500]) {
    const Zotero = { HTTP: { request: async () => ({ status, responseText: JSON.stringify(youdaoResponse('must not display')) }) } };
    await assert.rejects(createYoudaoTranslator(Zotero)(query('hello'), youdao, createQueryScope()), error => ['HTTP_ERROR', 'COOLDOWN'].includes(error.code));
  }
  const cases = [
    { status: 200, value: { errorCode: '50', translation: ['business error text'] }, code: 'PROVIDER_ERROR' },
    { status: 200, value: { errorCode: '0', translation: [''] }, code: 'MALFORMED_RESPONSE' },
    { status: 200, value: { errorCode: '0', translation: ['x'.repeat(32769)] }, code: 'MALFORMED_RESPONSE' },
    { status: 200, value: '<html>private body</html>', code: 'MALFORMED_RESPONSE' },
  ];
  for (const item of cases) {
    const translator = createYoudaoTranslator({ HTTP: { request: async () => body(item.status, item.value) } });
    await assert.rejects(translator(query('hello'), youdao, createQueryScope()), error => error.code === item.code && !error.message.includes('private body'));
  }
});

test('MyMemory uses a fixed English-to-Simplified-Chinese read-only GET without an email', async () => {
  let seen;
  const Zotero = { HTTP: { request: async (method, url, options) => { seen = { method, url, options }; return body(200, mymemoryResponse()); } } };
  const result = await createMyMemoryTranslator(Zotero)(query('Hello, world!'), mymemory, createQueryScope());
  const url = new URL(seen.url);
  assert.equal(seen.method, 'GET'); assert.equal(url.origin + url.pathname, 'https://api.mymemory.translated.net/get');
  assert.equal(url.searchParams.get('q'), 'Hello, world!'); assert.equal(url.searchParams.get('langpair'), 'en|zh-CN');
  assert.equal(seen.options.anon, true); assert.equal(seen.options.errorDelayMax, 0); assert.equal(seen.options.noRetryOnThrottle, true);
  assert.deepEqual(result, [{ type: 'online', sourceId: mymemory.id, text: '你好！', engineId: 'mymemory', sourceLanguage: 'en', targetLanguage: 'zh-CN' }]);
});

test('MyMemory rejects unsuccessful business status, finished quota and invalid text', async () => {
  for (const [value, code] of [
    [{ ...mymemoryResponse('business failure'), responseStatus: 403 }, 'PROVIDER_ERROR'],
    [{ ...mymemoryResponse('quota text'), quotaFinished: true }, 'COOLDOWN'],
    [{ responseStatus: 200, quotaFinished: false, responseData: { translatedText: 'x'.repeat(32769) } }, 'MALFORMED_RESPONSE'],
    [{ responseStatus: 200, quotaFinished: false, responseData: { translatedText: '' } }, 'MALFORMED_RESPONSE'],
  ]) {
    const translator = createMyMemoryTranslator({ HTTP: { request: async () => body(200, value) } }, { now: () => 100000 });
    await assert.rejects(translator(query('hello'), mymemory, createQueryScope()), error => error.code === code && !error.message.includes('business failure'));
  }
});

test('Online HTTP cancellation aborts observed and late XHRs for both new engines', async () => {
  for (const [source, factory] of [[youdao, createYoudaoTranslator], [mymemory, createMyMemoryTranslator]]) {
    const scope = createQueryScope(), pending = deferred(); let observer, aborted = 0;
    const translator = factory({ HTTP: { request: (_method, _url, options) => { observer = options.requestObserver; return pending.promise; } } });
    const task = translator(query('hello'), source, scope);
    await flush(); scope.cancel();
    await assert.rejects(task, error => error.code === 'CANCELLED');
    observer({ abort() { aborted++; } }); assert.equal(aborted, 1, source.engineId);
    pending.resolve(body(200, source.engineId === 'youdao' ? youdaoResponse() : mymemoryResponse())); await flush();
  }
});

test('Online watchdogs abort timed-out XHRs for both new engines', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const [source, factory] of [[youdao, createYoudaoTranslator], [mymemory, createMyMemoryTranslator]]) {
    const pending = deferred(); let observer, aborted = 0;
    const translator = factory({ HTTP: { request: (_method, _url, options) => { observer = options.requestObserver; return pending.promise; } } }, { timeout: 250 });
    const task = translator(query('hello'), source, createQueryScope());
    const rejected = assert.rejects(task, error => error.code === 'TIMEOUT');
    await flush(); t.mock.timers.tick(250); await rejected;
    observer({ abort() { aborted++; } }); assert.equal(aborted, 1, source.engineId);
    pending.resolve(body(200, source.engineId === 'youdao' ? youdaoResponse() : mymemoryResponse())); await flush();
  }
});

test('Quota cooldown is per engine and never retries or blocks Youdao', async () => {
  let youdaoCalls = 0, mymemoryCalls = 0;
  const Zotero = { HTTP: { request: async (_method, url) => {
    if (url === 'https://aidemo.youdao.com/trans') { youdaoCalls++; return body(200, youdaoResponse()); }
    mymemoryCalls++; return body(200, { ...mymemoryResponse('quota'), quotaFinished: true });
  } } };
  const myMemory = createMyMemoryTranslator(Zotero, { now: () => 100000 });
  await assert.rejects(myMemory(query('hello'), mymemory, createQueryScope()), error => error.code === 'COOLDOWN' && error.retryAt === 160000);
  await assert.rejects(createMyMemoryTranslator(Zotero, { now: () => 100001 })(query('hello'), mymemory, createQueryScope()), error => error.code === 'COOLDOWN');
  assert.equal(mymemoryCalls, 1);
  assert.equal((await createYoudaoTranslator(Zotero)(query('hello'), youdao, createQueryScope()))[0].engineId, 'youdao');
  assert.equal(youdaoCalls, 1);
});

test('New engines preserve old source identities, ordering, enablement and selection when defaults are added', () => {
  const configured = [
    { ...bing, enabled: false }, { ...google, enabled: true },
    { id: 'local:stable', kind: 'local', path: '/stable.mdx', name: 'Local', enabled: false },
  ];
  const resolved = resolveSources(JSON.stringify(configured), [{ path: '/stable.mdx', name: 'Local' }]);
  assert.deepEqual(resolved, [...configured, defaultOnlineSource('youdao'), defaultOnlineSource('mymemory')]);
  assert.equal(ONLINE_ENGINE_IDS.length + 5000, MAX_QUERY_SOURCES);
});

test('Engine dispatch runs only the selected provider and source results retain attribution', async () => {
  const requests = [];
  const Zotero = { HTTP: { request: async (method, url) => {
    requests.push(new URL(url).origin);
    if (url.startsWith('https://aidemo.youdao.com/')) return body(200, youdaoResponse());
    if (url.startsWith('https://api.mymemory.translated.net/')) return body(200, mymemoryResponse());
    if (url.startsWith('https://edge.microsoft.com/')) return body(200, [{ to: 'zh-Hans', translations: [{ to: 'zh-Hans', text: '微软' }] }]);
    return body(200, [[['谷歌']], null, 'en']);
  } } };
  const dispatch = createOnlineTranslator(Zotero);
  for (const source of [google, bing, youdao, mymemory]) {
    const result = await querySources(query('hello'), [source], { translate: dispatch });
    assert.equal(result.results[0].engineId, source.engineId); assert.equal(result.results[0].sourceId, source.id);
  }
  assert.deepEqual(requests, ['https://translate.googleapis.com', 'https://edge.microsoft.com', 'https://aidemo.youdao.com', 'https://api.mymemory.translated.net']);
  const invalid = await querySources(query('hello'), [youdao], { translate: async () => [{ text: 'wrong engine', engineId: 'mymemory' }] });
  assert.equal(invalid.results.length, 0); assert.equal(invalid.groups[0].status, 'error');
});

test('Fallback follows the saved source order and stops on its first translation', async () => {
  const order = [];
  const fallback = await querySources(query('hello'), [mymemory, youdao, bing], { mode: 'fallback', translate: async (_query, source) => {
    order.push(source.engineId);
    return source.engineId === 'youdao' ? [{ text: '有道译文', engineId: 'youdao' }] : [];
  } });
  assert.deepEqual(order, ['mymemory', 'youdao']);
  assert.deepEqual(fallback.results.map(result => [result.sourceId, result.engineId, result.text]), [[youdao.id, 'youdao', '有道译文']]);
});
