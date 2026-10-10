import test from 'node:test';
import assert from 'node:assert/strict';
import { api, makeDictionary, source } from './fixtures.mjs';
import { wordAtPoint } from '../src/word-at-point.js';

function caret(value, offset, hit = true) {
  const node = { nodeType: 3, data: value, parentElement: { closest: () => ({}) } };
  const page = { contains: () => true };
  return { document: {
    elementFromPoint: () => ({ closest: () => page }),
    caretPositionFromPoint: () => ({ offsetNode: node, offset }),
    createRange: () => ({ setStart() {}, setEnd() {}, getClientRects: () => hit
      ? [{ left: 0, right: 100, top: 0, bottom: 20, width: 100, height: 20 }] : [] }),
  } };
}
test('Click extraction joins invisible characters but keeps punctuation and hit boundaries', () => {
  assert.equal(wordAtPoint(caret('trans\u00adformation', 9), 50, 10), 'transformation');
  assert.equal(wordAtPoint(caret('net\u200bwork', 6), 50, 10), 'network');
  assert.equal(wordAtPoint(caret('state-of-the-art', 7), 50, 10), 'state-of-the-art');
  assert.equal(wordAtPoint(caret('first,second', 8), 50, 10), 'second');
  assert.equal(wordAtPoint(caret('word', 2, false), 50, 10), '');
});
test('PDF glyph extraction joins an ignorable soft hyphen and reports the correct context range', () => {
  const text = 'trans\u00adformation', chars = [...text].map((c, i) => ({ c, ignorable: c === '\u00ad', rect: [i * 6, 5, i * 6 + 6, 20] }));
  const rect = { left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100 }, page = { dataset: { pageNumber: '1' }, querySelector: () => ({ getBoundingClientRect: () => rect }) };
  const win = { document: { elementFromPoint: () => ({ closest: () => page }) }, PDFViewerApplication: { pdfViewer: { getPageView: () => ({ viewport: { width: 200, height: 100, convertToPdfPoint: (x, y) => [x, y] } }) } } };
  let context; assert.equal(wordAtPoint(win, 50, 10, { _pdfPages: [{ chars }] }, value => { context = value; }), 'transformation');
  assert.deepEqual(context, { pageIndex: 0, start: 0, end: text.length });
});

export function environment(files = {}) {
  const fallback = makeDictionary([['word', '<p>definition</p>']]);
  const prefs = new Map([['localMDXClick.enabled', false]]);
  const env = {
    Zotero: { Prefs: { get: key => prefs.get(key), set: (key, value) => prefs.set(key, value) }, logError() {} },
    IOUtils: {
      stat: async path => ({ type: /\.mdx$/i.test(path) ? 'regular' : 'directory', size: (files[path] || fallback).length }),
      getChildren: async path => Object.keys(files).filter(file => file.slice(0, file.lastIndexOf('/')) === path),
      read: async (path, { offset, maxBytes }) => (files[path] || fallback).subarray(offset, offset + maxBytes),
    },
  };
  return { env, prefs };
}
test('A corrupt candidate dictionary leaves the working folder, list and index active', async () => {
  const { env, prefs } = environment({ '/good/A.mdx': makeDictionary([['word', 'good']]), '/bad/B.mdx': new Uint8Array(64) });
  const app = api.createApp(env, 'test'); await app.scanFolder('/good');
  const original = await app.loadDictionary();
  await assert.rejects(app.scanFolder('/bad'), /文件头/);
  assert.equal(app.getPath(), '/good/A.mdx'); assert.equal(prefs.get('localMDXClick.folder'), '/good');
  assert.deepEqual(app.getDictionaries().map(d => d.path), ['/good/A.mdx']);
  assert.equal(await app.loadDictionary(), original);
});
test('A later selection wins while an earlier dictionary is still being read', async () => {
  const bytes = makeDictionary([['word', 'meaning']]);
  const { env } = environment({ '/dict/A.mdx': bytes, '/dict/B.mdx': bytes, '/dict/C.mdx': bytes });
  const app = api.createApp(env, 'test'); await app.scanFolder('/dict');
  let resume; const read = env.IOUtils.read;
  env.IOUtils.read = async (path, options) => { if (path.endsWith('B.mdx') && options.offset === 0) await new Promise(resolve => { resume = resolve; }); return read(path, options); };
  const early = app.selectDictionary('/dict/B.mdx'); while (!resume) await new Promise(resolve => setImmediate(resolve));
  await app.selectDictionary('/dict/C.mdx'); resume(); assert.equal(await early, false); assert.equal(app.getPath(), '/dict/C.mdx');
});
test('Different missing MDD resources reuse compact block membership after key cache eviction', async () => {
  const rows = Array.from({ length: 14000 }, (_, i) => [`sound/${String(i).padStart(6, '0')}-${'x'.repeat(105)}.mp3`, Buffer.from([i % 256])]);
  const archive = await api.MDDArchive.open(source(makeDictionary(rows, { binary: true, keyBlockSize: 100, recordChunk: 100000 })));
  assert.equal(await archive.lookupBytes('missing-one.png'), null);
  const first = archive.lookupStats.keyBlocksDecompressed;
  assert.equal(await archive.lookupBytes('missing-two.png'), null);
  assert.ok(archive.lookupStats.keyBlocksDecompressed - first < 14, 'A second distinct miss must skip most already inspected blocks');
  assert.deepEqual(await archive.lookupBytes(rows[0][0]), new Uint8Array([0]));
  archive.clearCache();
  assert.equal(await archive.lookupBytes('missing-three.png'), null);
});

function backupEnvironment(files, settings, choices = ['/backup.json']) {
  const { env, prefs } = environment(files), stat = env.IOUtils.stat;
  env.IOUtils.stat = async path => path === '/backup.json' ? { type: 'regular', size: 1000 } : stat(path);
  env.IOUtils.readUTF8 = async () => JSON.stringify({ format: 'local-mdx-settings', version: 1, settings });
  env.ChromeUtils = { importESModule: () => ({ FilePicker: class {
    constructor() { this.modeOpen = 1; this.modeGetFolder = 2; this.returnOK = 0; this.returnReplace = 1; }
    init() {} appendFilter() {} async show() { this.file = choices.shift(); return this.file ? this.returnOK : 2; }
  } }) };
  return { env, prefs };
}
test('A corrupt backup dictionary cannot overwrite existing appearance, vocabulary or source paths', async () => {
  const { env, prefs } = backupEnvironment({ '/good/A.mdx': makeDictionary([['word', 'good']]), '/bad/B.mdx': new Uint8Array(64) },
    { path: '/bad/B.mdx', directories: '["/bad"]', theme: 'dark', vocabulary: '[]', enabled: true });
  const app = api.createApp(env, 'test'); await app.scanFolder('/good'); prefs.set('localMDXClick.theme', 'light'); prefs.set('localMDXClick.vocabulary', 'original');
  await assert.rejects(app.importSettings({}), /文件头/);
  assert.equal(app.getPath(), '/good/A.mdx'); assert.equal(prefs.get('localMDXClick.theme'), 'light');
  assert.equal(prefs.get('localMDXClick.vocabulary'), 'original'); assert.equal(prefs.get('localMDXClick.enabled'), false);
});
test('A partial appearance backup preserves the working library and does not reindex it', async () => {
  const { env, prefs } = backupEnvironment({ '/good/A.mdx': makeDictionary([['word', 'good']]) }, { theme: 'dark' });
  const app = api.createApp(env, 'test'); await app.scanFolder('/good'); const dictionary = await app.loadDictionary();
  await app.importSettings({}); assert.equal(prefs.get('localMDXClick.theme'), 'dark');
  assert.equal(app.getPath(), '/good/A.mdx'); assert.equal(prefs.get('localMDXClick.folder'), '/good');
  assert.equal(prefs.get('localMDXClick.directories'), '["/good"]'); assert.equal(await app.loadDictionary(), dictionary);
});
test('A partial library backup preserves omitted appearance and vocabulary preferences', async () => {
  const files = { '/good/A.mdx': makeDictionary([['word', 'good']]), '/new/B.mdx': makeDictionary([['word', 'new']]) };
  const { env, prefs } = backupEnvironment(files, { directories: '["/new"]' });
  const app = api.createApp(env, 'test'); await app.scanFolder('/good'); prefs.set('localMDXClick.theme', 'light'); prefs.set('localMDXClick.vocabulary', '[]');
  await app.importSettings({}); assert.equal(app.getPath(), '/new/B.mdx'); assert.equal(prefs.get('localMDXClick.theme'), 'light'); assert.equal(prefs.get('localMDXClick.vocabulary'), '[]');
});
test('Backup import relocates missing directories and cancellation leaves the current setup unchanged', async () => {
  const files = { '/good/A.mdx': makeDictionary([['word', 'good']]), '/new/B.mdx': makeDictionary([['word', 'new']]) };
  for (const cancelled of [true, false]) {
    const { env, prefs } = backupEnvironment(files, { path: '/old/B.mdx', folder: '/old', directories: '["/old"]', theme: 'dark' }, ['/backup.json', cancelled ? null : '/new']);
    const stat = env.IOUtils.stat; env.IOUtils.stat = async path => { if (path === '/old') throw new Error('missing'); return stat(path); };
    const app = api.createApp(env, 'test'); await app.scanFolder('/good'); await app.importSettings({});
    assert.equal(app.getPath(), cancelled ? '/good/A.mdx' : '/new/B.mdx');
    assert.equal(prefs.get('localMDXClick.theme'), cancelled ? undefined : 'dark');
    assert.equal(prefs.get('localMDXClick.directories'), cancelled ? '["/good"]' : '["/new"]');
  }
});
test('A newer dictionary selection cancels a pending backup commit', async () => {
  const bytes = makeDictionary([['word', 'meaning']]);
  const { env, prefs } = backupEnvironment({ '/good/A.mdx': bytes, '/good/C.mdx': bytes, '/new/B.mdx': bytes }, { directories: '["/new"]', theme: 'dark' });
  const app = api.createApp(env, 'test'); await app.scanFolder('/good');
  let resume; const read = env.IOUtils.read;
  env.IOUtils.read = async (path, options) => { if (path === '/new/B.mdx' && options.offset === 0) await new Promise(resolve => { resume = resolve; }); return read(path, options); };
  const importing = app.importSettings({}); while (!resume) await new Promise(resolve => setImmediate(resolve));
  await app.selectDictionary('/good/C.mdx'); resume(); await importing;
  assert.equal(app.getPath(), '/good/C.mdx'); assert.equal(prefs.get('localMDXClick.theme'), undefined);
});
test('Export and backup actions write the requested Unicode files and compatible settings format', async () => {
  const { env, prefs } = backupEnvironment({}, {}, ['/words.csv', '/words.tsv', '/settings.json']); const writes = new Map();
  env.IOUtils.writeUTF8 = async (path, text) => writes.set(path, text);
  const app = api.createApp(env, 'test'); app.vocabulary.add({ word: 'network', results: [{ headword: 'network', html: '<p>网络</p>', dictionaryName: 'A' }], context: {} });
  await app.exportWords({}, 'csv'); await app.exportWords({}, 'anki'); await app.backupSettings({});
  assert.ok(writes.get('/words.csv').startsWith('\ufeff')); assert.ok(writes.get('/words.csv').includes('网络'));
  assert.equal(writes.get('/words.tsv').trim().split('\t').length, 8);
  const backup = JSON.parse(writes.get('/settings.json')); assert.equal(backup.format, 'local-dictionary-settings'); assert.equal(backup.settings.vocabulary, prefs.get('localMDXClick.vocabulary'));
});
