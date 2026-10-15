import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSettings, settingsBackup, relocateSettings } from '../src/settings-backup.js';
import { mountEnhancements } from '../src/preferences-panel.js';
import { validateSources, resolveSources } from '../src/source-settings.js';
import { MAX_QUERY_SOURCES, ONLINE_ENGINE_CATALOG } from '../src/online-engine-catalog.js';
const local = { id: 'kept-id', kind: 'local', path: '/old/A.mdx', name: 'A', enabled: false };
const google = { id: 'online:google', kind: 'online', engineId: 'google', name: 'Google 翻译（实验性）', enabled: false };
const bing = { id: 'online:bing', kind: 'online', engineId: 'bing', name: 'Microsoft 翻译（Edge，实验性）', enabled: false };
const youdao = { id: 'online:youdao', kind: 'online', engineId: 'youdao', name: '有道翻译（网页体验，实验性）', enabled: false };
const mymemory = { id: 'online:mymemory', kind: 'online', engineId: 'mymemory', name: 'MyMemory 翻译（英→简中，实验性）', enabled: false };
const backup = settings => ({ format: 'local-dictionary-settings', version: 1, settings });

test('Source configuration validates and copies each source without mutating caller data', () => {
  const input = [local, google], result = validateSources(input);
  assert.deepEqual(result, input); assert.notEqual(result, input); assert.notEqual(result[0], input[0]);
  result[0].enabled = true; assert.equal(input[0].enabled, false);
});

test('Source configuration rejects malformed shapes, duplicate identities, paths and unknown engines', () => {
  const invalid = [null, {}, [null], Array(1), [{ ...local, id: '' }], [{ ...local, id: 'x'.repeat(2201) }],
    [{ ...local, path: '' }], [{ ...local, path: 'a\nb' }], [{ ...local, path: 'a\0b' }], [{ ...local, path: 'x'.repeat(2049) }],
    [{ ...local, enabled: 'false' }], [{ ...local, name: null }], [{ ...local, engineId: 'google' }],
    [{ ...google, engineId: 'other' }], [{ ...bing, engineId: 'other' }], [{ ...google, path: '/fake' }], [{ ...google, token: 'secret' }],
    [local, { ...google, id: local.id }], [local, { ...local, id: 'other' }], [google, { ...google, id: 'other' }],
    Array.from({ length: MAX_QUERY_SOURCES + 1 }, (_, i) => ({ ...local, id: String(i), path: '/' + i }))];
  for (const value of invalid) assert.throws(() => validateSources(value), undefined, JSON.stringify(value)?.slice(0, 200));
});

test('Source configuration accepts the expanded limit for all local entries plus four engines', () => {
  const maximum = Array.from({ length: MAX_QUERY_SOURCES }, (_, index) => ({ ...local, id: 'source-' + index, path: '/dict-' + index }));
  assert.equal(validateSources(maximum).length, 5004);
});

test('Reconciliation retains configured order, IDs and flags, discards absent locals, and appends discoveries', () => {
  const configured = [{ ...google, enabled: true }, local, { ...local, id: 'gone', path: '/gone' }];
  const result = resolveSources(JSON.stringify(configured), [{ path: '/new/B.ifo', name: 'B' }, { path: '/old/A.mdx', name: 'A refreshed' }]);
  assert.deepEqual(result, [{ ...google, enabled: true }, { ...local, name: 'A refreshed' },
    { id: 'local:/new/B.ifo', kind: 'local', path: '/new/B.ifo', name: 'B', enabled: true }, bing, youdao, mymemory]);
  assert.equal(configured[1].name, 'A');
});

test('An empty or legacy source setting discovers locals then each independent disabled online source', () => {
  const result = resolveSources('', [{ path: '/A.mdx', name: 'A' }, { path: '/A.mdx', name: 'duplicate' }]);
  assert.deepEqual(result, [{ id: 'local:/A.mdx', kind: 'local', path: '/A.mdx', name: 'A', enabled: true }, google, bing, youdao, mymemory]);
  assert.deepEqual(resolveSources(undefined, []), [google, bing, youdao, mymemory]);
  assert.throws(() => resolveSources('{bad', []));
  assert.throws(() => resolveSources('[{"kind":"unsupported"}]', []));
});

test('Reconciliation keeps generated IDs unique when imported IDs collide with discovered defaults', () => {
  const sources = resolveSources(JSON.stringify([{ ...local, id: 'local:/B.mdx' }]), [
    { path: '/old/A.mdx', name: 'A' }, { path: '/B.mdx', name: 'B' },
  ]);
  assert.equal(sources[0].id, 'local:/B.mdx');
  assert.equal(new Set(sources.map(source => source.id)).size, sources.length);
  assert.doesNotThrow(() => validateSources(sources));
});

test('Adding Microsoft does not transfer Google enabled state, identity or selection', () => {
  const configured = [{ ...google, enabled: true }, { ...local, enabled: false }];
  const resolved = resolveSources(configured, [{ path: local.path, name: 'A' }]);
  assert.deepEqual(resolved, [{ ...google, enabled: true }, { ...local, enabled: false }, bing, youdao, mymemory]);
  assert.equal(resolved.find(source => source.engineId === 'bing').id, 'online:bing');
});

test('Version 1 backups roundtrip source settings and click enablement while old backups remain partial', () => {
  const values = { clickEnabled: false, selectedSource: 'online:google', sources: JSON.stringify([local, google, bing, youdao, mymemory]) };
  assert.deepEqual({ ...validateSettings(JSON.parse(settingsBackup(key => values[key]))) }, values);
  const old = validateSettings(backup({ enabled: true, selectionEnabled: false }));
  assert.equal(Object.hasOwn(old, 'clickEnabled'), false);
  assert.deepEqual({ clickEnabled: false, ...old }, { clickEnabled: false, enabled: true, selectionEnabled: false });
});

test('Backup imports reject invalid source fields and malformed selection identities', () => {
  for (const settings of [{ clickEnabled: 'false' }, { sources: 'not json' }, { sources: JSON.stringify([{ ...google, engineId: 'unknown' }]) },
    { sources: [] }, { selectedSource: 9 }, { selectedSource: '' }, { selectedSource: 'x'.repeat(2201) }]) {
    assert.throws(() => validateSettings(backup(settings)));
  }
});

test('Relocation moves only local source paths and preserves IDs, online engine and selected source', () => {
  const original = { sources: JSON.stringify([local, google]), selectedSource: 'kept-id', clickEnabled: false };
  const moved = relocateSettings(original, [['/old', '/new']]);
  assert.deepEqual(JSON.parse(moved.sources), [{ ...local, path: '/new/A.mdx' }, google]);
  assert.equal(moved.selectedSource, 'kept-id'); assert.equal(moved.clickEnabled, false);
  assert.equal(JSON.parse(original.sources)[0].path, '/old/A.mdx');
});

// Small DOM surface: only creation, fields and event dispatch are replaced.
// The real preferences panel owns all source mutations and rendering.
class PreferenceNode {
  constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.listeners = {}; this.attributes = {}; this.classList = { add() {} }; }
  append(...nodes) { this.children.push(...nodes); }
  prepend(...nodes) { this.children.unshift(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  closest() { return this; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  get textContent() { return this.text || this.children.map(child => child.textContent || '').join(''); }
  set textContent(value) { this.text = value; this.children = []; }
}
const descendants = node => [node, ...node.children.flatMap(descendants)];
function preferences(sources, onSources) {
  const host = new PreferenceNode('div');
  const doc = { getElementById: id => id === 'local-mdx-enhancements' ? host : null,
    createElementNS: (_ns, tag) => new PreferenceNode(tag) };
  const options = { get: () => undefined, set() {}, vocabulary: { list: () => [] }, dictionaries: () => [], folders: () => [], sources, onSources };
  return { host, refresh: mountEnhancements({ document: doc }, options) };
}

test('Preferences disclose every disabled online endpoint before enablement', async () => {
  let values = [local, google, bing, youdao, mymemory];
  const { host } = preferences(() => values, next => { values = next; });
  const nodes = descendants(host);
  for (const source of values.filter(item => item.kind === 'online')) {
    const checkbox = nodes.find(node => node.tagName === 'input' && node.dataset.sourceId === source.id);
    assert.ok(checkbox, `${source.name} enable switch must exist`); assert.equal(checkbox.checked, false);
    const label = nodes.find(node => node.tagName === 'label' && descendants(node).includes(checkbox));
    assert.match(label.textContent, /实验性/); assert.ok(label.textContent.includes(ONLINE_ENGINE_CATALOG[source.engineId].disclosure));
  }
  const edgeControl = nodes.find(node => node.tagName === 'input' && node.dataset.sourceId === bing.id);
  edgeControl.checked = true; await edgeControl.listeners.change();
  assert.equal(values[2].enabled, true); assert.equal(values[1].enabled, false);
});

test('Unified source ordering moves online and local sources together and keeps IDs and flags', async () => {
  let values = [local, google, bing, youdao, mymemory];
  const { host } = preferences(() => values, next => { values = next; });
  const moveUp = descendants(host).find(node => node.attributes['aria-label'] === '上移 Microsoft 翻译（Edge，实验性）');
  assert.ok(moveUp, 'Microsoft reorder control must exist'); await moveUp.listeners.click();
  assert.deepEqual(values, [local, bing, google, youdao, mymemory]);
  assert.doesNotThrow(() => preferences());
});
