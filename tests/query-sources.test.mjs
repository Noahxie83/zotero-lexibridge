/* SPDX-License-Identifier: GPL-3.0-or-later */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueryScope, querySources } from '../src/query-sources.js';
import { createGoogleTranslator } from '../src/google-translate.js';
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const query = { text: 'hello', translationText: 'Hello, world!', candidates: ['hello'], source: 'manual' };
const local = id => ({ id, kind: 'local', path: '/' + id, name: id, enabled: true });
const online = id => ({ id, kind: 'online', engineId: 'google', name: id, enabled: true });
const entry = text => ({ headword: text, html: '<p>' + text + '</p>' });
const response = text => ({ status: 200, responseText: JSON.stringify([[[text, 'Hello', null, null, 1]], null, 'en']) });

test('scope cancellation composes callbacks, unregisters and immediately invokes late subscribers', () => {
  assert.equal(typeof createQueryScope, 'function', 'scope runtime must be implemented');
  const a = createQueryScope(), b = createQueryScope(); assert.notEqual(a.id, b.id);
  const calls = []; a.onCancel(() => { calls.push(1); throw Error('cleanup'); });
  a.onCancel(() => calls.push(2)); const off = a.onCancel(() => calls.push(3)); off();
  a.cancel(); a.cancel(); a.onCancel(() => calls.push(4));
  assert.deepEqual(calls, [1, 2, 4]); assert.equal(a.cancelled(), true); assert.equal(b.cancelled(), false);
});

test('all mode bounds local work at two, progresses independently, and preserves final configured order', async () => {
  const gates = [deferred(), deferred(), deferred()]; const started = []; const released = []; const updates = [];
  const scope = createQueryScope();
  const task = querySources(query, [local('a'), online('g'), local('b'), local('c')], {
    mode: 'all', scope, forms: false,
    load: async path => { const i = 'abc'.indexOf(path.slice(1)); started.push(i); return { dictionary: { stats: { indexed: i }, lookup: () => gates[i].promise }, release: () => released.push(i) }; },
    translate: async (_, source) => [{ text: '你好', engineId: source.engineId, html: 'must not escape', dictionaryPath: 'forbidden' }],
    onUpdate: update => updates.push(update),
  });
  await flush(); assert.deepEqual(started, [0, 1]);
  assert.equal(updates.find(u => u.sourceId === 'g' && u.status === 'ready').results[0].text, '你好');
  gates[1].resolve([entry('b')]); await flush(); assert.deepEqual(started, [0, 1, 2]);
  gates[2].resolve([]); gates[0].resolve([entry('a')]);
  const result = await task;
  assert.deepEqual(result.groups.map(g => g.sourceId), ['a', 'g', 'b', 'c']);
  assert.deepEqual(result.groups.map(g => g.status), ['ready', 'ready', 'ready', 'empty']);
  assert.deepEqual(released.sort(), [0, 1, 2]);
  assert.deepEqual(result.results.map(r => r.type), ['local', 'online', 'local']);
  assert.equal(result.results[1].html, undefined); assert.equal(result.results[1].dictionaryPath, undefined);
  assert.equal(result.groups[0].capabilities.resources, true); assert.equal(result.groups[1].capabilities.resources, false);
  assert.equal(result.groups[1].capabilities.copy, true);
  const first = updates.find(u => u.sourceId === 'a'); assert.equal(first.status, 'queued'); assert.deepEqual(first.results, []);
  assert.throws(() => first.errors.push('mutation'), TypeError);
});

test('single takes only the first source and fallback waits strictly until an empty source completes', async () => {
  const gate = deferred(), started = [];
  const load = async path => { started.push(path); return { lookup: async () => path === '/a' ? gate.promise : [entry('b')] }; };
  const task = querySources(query, [local('a'), local('b'), local('c')], { mode: 'fallback', forms: false, load });
  await flush(); assert.deepEqual(started, ['/a']); gate.resolve([]);
  assert.deepEqual((await task).groups.map(g => g.sourceId), ['a', 'b']);
  started.length = 0; await querySources(query, [local('b'), local('c')], { load }); assert.deepEqual(started, ['/b']);
});

test('Mixed queries retain independent Google and Edge result identities; fallback remains strictly ordered', async () => {
  const googleSource = { ...online('google'), name: 'Google' }, edgeSource = { ...online('edge'), id: 'online:bing', engineId: 'bing', name: 'Microsoft Edge' };
  const mixed = await querySources(query, [googleSource, local('local'), edgeSource], { mode: 'all',
    translate: async (_, source) => [{ text: source.engineId + ' text', engineId: source.engineId }],
    load: async () => ({ lookup: async () => [entry('local')] }),
  });
  assert.deepEqual(mixed.results.map(result => result.engineId), ['google', undefined, 'bing']);
  assert.deepEqual(mixed.groups.map(group => group.sourceId), ['google', 'local', 'online:bing']);
  const order = [];
  const fallback = await querySources(query, [googleSource, local('local'), edgeSource], { mode: 'fallback',
    translate: async (_, source) => { order.push(source.engineId); return []; },
    load: async () => ({ lookup: async () => [entry('local hit')] }),
  });
  assert.deepEqual(order, ['google']); assert.deepEqual(fallback.groups.map(group => group.sourceId), ['google', 'local']);
});

test('cancelling queued and running work isolates scopes, releases late leases, and never emits stale updates', async () => {
  const lease = deferred(), scope = createQueryScope(), updates = [], loaded = []; let releases = 0;
  const task = querySources(query, [local('a'), local('b'), local('c')], { mode: 'all', scope,
    onUpdate: u => updates.push(u), load: async path => { loaded.push(path); return lease.promise; } });
  await flush(); scope.cancel(); const count = updates.length; const cancelled = await task;
  assert.deepEqual(loaded, ['/a', '/b']); assert.equal(cancelled.results.length, 0);
  lease.resolve({ dictionary: { lookup: async () => [entry('late')] }, release: () => releases++ }); await flush();
  assert.equal(releases, 2); assert.equal(updates.length, count);
  const other = await querySources(query, [local('ok')], { load: async () => ({ lookup: async () => [entry('ok')] }) });
  assert.equal(other.results.length, 1);
});

test('global online lane serializes different query scopes and cancellation removes queued work without stalling', async () => {
  const gate = deferred(), started = [], a = createQueryScope(), b = createQueryScope(), c = createQueryScope();
  const translate = async (_, source) => { started.push(source.id); if (source.id === 'a') await gate.promise; return [{ text: source.id, engineId: source.engineId }]; };
  const one = querySources(query, [online('a')], { scope: a, translate });
  const two = querySources(query, [online('b')], { scope: b, translate });
  const three = querySources(query, [online('c')], { scope: c, translate });
  await flush(); assert.deepEqual(started, ['a']); b.cancel(); a.cancel();
  await Promise.all([one, two]); await flush(); assert.deepEqual(started, ['a', 'c']);
  assert.equal((await three).results[0].text, 'c'); gate.resolve(); await flush();
});

test('source failure and lookup diagnostics stay isolated from successful sources', async () => {
  const result = await querySources(query, [local('broken'), local('lookup'), local('ok'), online('offline')], { mode: 'all', forms: false,
    load: async path => { if (path === '/broken') throw Error('bad file'); return { lookup: async () => { if (path === '/lookup') throw Error('bad block'); return [{ ...entry('hello'), warnings: ['partial'] }]; } }; },
    translate: async () => { throw Object.assign(Error('offline'), { code: 'OFFLINE' }); },
  });
  assert.deepEqual(result.groups.map(g => g.status), ['error', 'error', 'ready', 'error']);
  assert.equal(result.results.length, 1); assert.deepEqual(result.groups[2].warnings, ['partial']);
  assert.match(result.groups[0].errors[0], /bad file/); assert.match(result.groups[1].errors[0], /bad block/);
});

test('Google sends preserved punctuation to fixed endpoint and returns only typed text', async () => {
  let options, url; const translator = createGoogleTranslator({ HTTP: { request: async (method, value, opts) => { assert.equal(method, 'GET'); url = new URL(value); options = opts; return response('你好，世界！'); } } });
  const result = await translator(query, online('google'), createQueryScope());
  assert.equal(url.origin + url.pathname, 'https://translate.googleapis.com/translate_a/single');
  assert.equal(url.searchParams.get('q'), 'Hello, world!'); assert.equal(url.searchParams.get('tl'), 'zh-CN');
  assert.equal(options.errorDelayMax, 0); assert.equal(options.noRetryOnThrottle, true); assert.equal(options.timeout, 10000); assert.equal(options.anon, true);
  assert.deepEqual(result, [{ type: 'online', sourceId: 'google', text: '你好，世界！', engineId: 'google', sourceLanguage: 'en', targetLanguage: 'zh-CN' }]);
});

test('Google cancellation aborts XHR even when observer arrives late and frees the global lane', async () => {
  const scope = createQueryScope(); const pending = deferred(); let observer, aborted = 0;
  const translate = createGoogleTranslator({ HTTP: { request: (_, __, options) => { observer = options.requestObserver; return pending.promise; } } });
  const task = querySources(query, [online('google')], { scope, translate }); await flush(); scope.cancel();
  await task; observer({ abort: () => aborted++ }); assert.equal(aborted, 1);
  const next = await querySources(query, [online('next')], { translate: async (_, source) => [{ text: 'next', engineId: source.engineId }] });
  assert.equal(next.results[0].text, 'next'); pending.resolve(response('ignored')); await flush();
});

test('Google 429 cooldown is shared across translator instances, honors Retry-After and never resends', async () => {
  let calls = 0; const clock = { now: 100000 }; const Zotero = { HTTP: { request: async () => { calls++; throw Object.assign(Error('rate limit'), { status: 429, xmlhttp: { getResponseHeader: () => '2' } }); } } };
  const first = createGoogleTranslator(Zotero, { now: () => clock.now });
  await assert.rejects(first(query, online('g'), createQueryScope()), e => e.code === 'COOLDOWN' && e.retryAt === 102000);
  const second = createGoogleTranslator(Zotero, { now: () => clock.now });
  const grouped = await querySources(query, [online('g')], { translate: second });
  assert.equal(grouped.groups[0].status, 'cooldown'); assert.equal(grouped.groups[0].retryAt, 102000); assert.equal(calls, 1);
  clock.now = 102001; await assert.rejects(second(query, online('g'), createQueryScope())); assert.equal(calls, 2);
});

test('Google rejects malformed and oversized responses while timeout and offline errors stay isolated', async () => {
  for (const body of ['{}', '[[]]', '[[[123]],null,"en"]', '[[["ok"],null],null,"en"]', 'x'.repeat(262145), JSON.stringify([[['x'.repeat(32769)]], null, 'en'])]) {
    const translate = createGoogleTranslator({ HTTP: { request: async () => ({ status: 200, responseText: body }) } });
    await assert.rejects(translate(query, online('g'), createQueryScope()), e => e.code === 'MALFORMED_RESPONSE');
  }
  for (const message of ['Request timed out after 10000 ms', 'Browser is offline']) {
    const translate = createGoogleTranslator({ HTTP: { request: async () => { throw Error(message + ' https://translate.googleapis.com/?q=private'); } } });
    const result = await querySources(query, [online('g'), local('ok')], { mode: 'all', translate, load: async () => ({ lookup: async () => [entry('ok')] }) });
    assert.deepEqual(result.groups.map(g => g.status), ['error', 'ready']);
    assert.equal(result.groups[0].errors[0], 'Google request failed; check network or proxy settings.');
    assert.doesNotMatch(result.groups[0].errors[0], /private|translate\.googleapis/);
  }
});

test('Google rejects missing and zero HTTP statuses before parsing a valid-looking body', async () => {
  for (const status of [undefined, 0]) {
    const translator = createGoogleTranslator({ HTTP: { request: async () => ({ status, responseText: JSON.stringify([[['伪成功']], null, 'en']) }) } });
    await assert.rejects(translator(query, online('g'), createQueryScope()), error => error.code === 'HTTP_ERROR');
  }
});

test('Google watchdog aborts a stalled request and also aborts an XHR observed after the deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let observer, aborted = 0; const pending = deferred();
  const translate = createGoogleTranslator({ HTTP: { request: (_, __, options) => { observer = options.requestObserver; return pending.promise; } } }, { timeout: 250 });
  const task = translate(query, online('g'), createQueryScope());
  const rejected = assert.rejects(task, error => error.code === 'TIMEOUT');
  t.mock.timers.tick(250); await rejected;
  observer({ abort: () => aborted++ }); assert.equal(aborted, 1);
  pending.resolve(response('late')); await flush();
});

test('Google aborts an already observed XHR immediately on cancellation', async () => {
  const scope = createQueryScope(), pending = deferred(); let aborted = 0;
  const translate = createGoogleTranslator({ HTTP: { request: (_, __, options) => { options.requestObserver({ abort: () => aborted++ }); return pending.promise; } } });
  const task = translate(query, online('g'), scope);
  const rejected = assert.rejects(task, error => error.code === 'CANCELLED');
  scope.cancel(); await rejected; assert.equal(aborted, 1); pending.reject(Error('aborted')); await flush();
});

test('Google cooldown accepts HTTP dates and falls back to sixty seconds for missing or invalid headers', async () => {
  for (const [header, expected] of [[null, 160000], ['invalid', 160000], ['Thu, 01 Jan 1970 00:02:00 GMT', 120000]]) {
    const Zotero = { HTTP: { request: async () => { throw Object.assign(Error('limited'), { status: 429, xmlhttp: { getResponseHeader: () => header } }); } } };
    const translate = createGoogleTranslator(Zotero, { now: () => 100000 });
    await assert.rejects(translate(query, online('g'), createQueryScope()), error => error.code === 'COOLDOWN' && error.retryAt === expected);
  }
});

test('cancellation from a running update prevents a dictionary read from starting', async () => {
  const scope = createQueryScope(); let reads = 0;
  const result = await querySources(query, [local('a')], { scope,
    onUpdate: update => { if (update.status === 'running') scope.cancel(); },
    load: async () => { reads++; return { lookup: async () => [entry('late')] }; },
  });
  assert.equal(reads, 0); assert.equal(result.results.length, 0);
});
