import test from 'node:test';
import assert from 'node:assert/strict';
import { wordForms, lookupWithForms } from '../src/morphology.js';
import { queryDictionaries } from '../src/query-engine.js';
import { QueryHistory } from '../src/history.js';
import { VocabularyStore, exportVocabulary, vocabularyNote, saveVocabularyNote } from '../src/vocabulary.js';
import { appearanceSettings, nativeAppearanceCSS, preferredAudio } from '../src/appearance-settings.js';
import { folderList, scanDirectories, orderedDictionaries } from '../src/directory-library.js';
import { validateSettings, settingsBackup, relocateSettings } from '../src/settings-backup.js';
import { editDistance, spellingSuggestions } from '../src/word-search.js';
import { readerContext } from '../src/reader-adapter.js';
import { api, makeDictionary, source } from './fixtures.mjs';
test('Word forms cover regular, irregular and ambiguous spellings without altering phrases', () => {
  assert.ok(wordForms('studies').includes('study')); assert.ok(wordForms('running').includes('run'));
  assert.ok(wordForms('making').includes('make')); assert.ok(wordForms('went').includes('go'));
  assert.deepEqual(wordForms('axes').slice(0, 2), ['axis', 'axe']);
  assert.deepEqual(wordForms('neural networks'), []); assert.deepEqual(wordForms('state-of-the-art'), []);
  assert.ok(wordForms('transformed').length <= 8);
});
test('Appearance clamps values, preserves original CSS by default and resolves pronunciation fallback', () => {
  const config = appearanceSettings(key => ({ fontSize: 100, popupWidth: -1, popupHeight: NaN, theme: 'bad' })[key]);
  assert.deepEqual(config, { fontSize: 28, width: 320, height: 580, theme: 'original' });
  assert.equal(nativeAppearanceCSS({ fontSize: 16, theme: 'original' }), ''); assert.ok(nativeAppearanceCSS({ theme: 'dark' }).includes('color-scheme:dark'));
  assert.equal(preferredAudio(['sound/gb_word.mp3', 'sound/us_word.mp3'], 'us'), 'sound/us_word.mp3'); assert.equal(preferredAudio(['unknown.mp3'], 'uk'), 'unknown.mp3');
});
test('Multiple directories deduplicate, optionally recurse and preserve explicit query order', async () => {
  const children = { '/A': ['/A/a.mdx', '/A/sub'], '/A/sub': ['/A/sub/c.mdx'], '/B': ['/B/b.mdx'] };
  const fs = { stat: async path => ({ type: path.endsWith('.mdx') ? 'regular' : 'directory' }), getChildren: async path => children[path] || [] };
  assert.equal((await scanDirectories(fs, ['/A', '/A', '/B'])).length, 2);
  const list = await scanDirectories(fs, ['/A', '/B'], { recursive: true }); assert.equal(list.length, 3);
  assert.equal(orderedDictionaries(list, '["/B/b.mdx"]')[0].name, 'b');
  assert.deepEqual(folderList('["/A","/A"]'), ['/A']); assert.deepEqual(folderList('bad', '/old'), ['/old']);
  await assert.rejects(scanDirectories(fs, ['/A'], { cancelled: () => true }), /取消/);
});
test('Backups roundtrip allowed settings and reject malformed enums, resource paths and records', () => {
  const values = { enabled: true, fontSize: 18, directories: '["/A"]', resources: '{}', vocabulary: '[]', queryMode: 'all' };
  assert.deepEqual({ ...validateSettings(JSON.parse(settingsBackup(key => values[key]))) }, values);
  for (const settings of [{ queryMode: 'remote' }, { fontSize: 999 }, { directories: '{}' }, { vocabulary: '[{}]' }, { resources: '{"__proto__":{}}' }]) {
    assert.throws(() => validateSettings({ format: 'local-mdx-settings', version: 1, settings }));
  }
});
test('Moving dictionary folders updates related paths while preserving paper identities', () => {
  const settings = { path: '/old/A.mdx', folder: '/old', directories: '["/old"]', dictionaryOrder: '["/old/A.mdx","/oldish/B.mdx"]', resources: '{"/old/A.mdx":{"folder":"/old/media","extraArchives":["/old/A.2.mdd","/external/C.mdd"]}}', vocabulary: '[{"context":{"itemKey":"ABC"}}]' };
  const moved = relocateSettings(settings, [['/old', '/new']]);
  assert.equal(moved.path, '/new/A.mdx'); assert.equal(moved.folder, '/new');
  assert.deepEqual(JSON.parse(moved.dictionaryOrder), ['/new/A.mdx', '/oldish/B.mdx']);
  assert.deepEqual(JSON.parse(moved.resources)['/new/A.mdx'], { folder: '/new/media', extraArchives: ['/new/A.2.mdd', '/external/C.mdd'] });
  assert.equal(moved.vocabulary, settings.vocabulary); assert.equal(settings.path, '/old/A.mdx');
});
test('Word browsing is paginated; spelling suggestions are bounded and never replace the query', async () => {
  const dictionary = await api.MDXDictionary.open(source(makeDictionary([['network', 'meaning'], ['neural', 'meaning'], ['study', 'meaning']])));
  assert.deepEqual(dictionary.browseWords('ne', 0, 1), { words: ['network'], more: true });
  assert.deepEqual(dictionary.browseWords('ne', 1, 1), { words: ['neural'], more: false });
  assert.deepEqual(await spellingSuggestions(dictionary, 'netwrok'), ['network']); assert.equal(editDistance('cat', 'elephant'), 3);
  assert.deepEqual(await spellingSuggestions(dictionary, 'netwrok', { cancelled: () => true }), []);
});
test('Vocabulary deduplicates per document/page, preserves dates and does not discard records at its limit', () => {
  let saved = '[]'; const store = new VocabularyStore({ read: () => saved, write: value => { saved = value; }, limit: 2 });
  const record = { word: 'network', results: [{ headword: 'network', html: '<script>bad()</script><p>safe meaning</p>', dictionaryName: 'A' }], context: { libraryID: 1, itemKey: 'ABC', pageIndex: 0 } };
  const first = store.add(record); const again = store.add(record);
  assert.equal(store.list().length, 1); assert.equal(again.createdAt, first.createdAt); assert.ok(!again.definition.includes('bad()'));
  store.add({ ...record, context: { ...record.context, pageIndex: 1 } });
  assert.throws(() => store.add({ ...record, word: 'other' }), /1000/); assert.equal(store.list().length, 2);
  store.remove(first.id); assert.equal(store.list().length, 1);
  saved = '{bad'; assert.throws(() => store.add(record)); assert.equal(saved, '{bad');
});
test('Vocabulary export escapes spreadsheet formulas, quoting and note HTML', () => {
  const row = { word: '=SUM(A1)', headwords: ['word'], dictionaries: ['A'], definition: 'a,"b"\nline', context: { sentence: '<img onerror="bad()">', pageIndex: 0, title: 'paper', sourceURL: 'javascript:bad()' } };
  const csv = exportVocabulary([row]); assert.ok(csv.startsWith('\ufeff')); assert.ok(csv.includes("'=SUM")); assert.ok(csv.includes('""b""'));
  assert.equal(exportVocabulary([row], 'anki').trim().split('\n').length, 1);
  assert.ok(!vocabularyNote(row).includes('<img')); assert.ok(!vocabularyNote(row).includes('javascript:'));
});
test('Notes validate source identity and readonly access before creating an item', async () => {
  let created = 0, written;
  const attachment = { id: 9, key: 'ABC', libraryID: 1, parentItemID: 4 };
  const library = { editable: false };
  const Zotero = { Items: { get: () => attachment }, Libraries: { get: () => library }, Item: class {
    constructor() { created++; } setNote(value) { written = value; } async saveTx() { assert.equal(this.parentID, 4); return 10; }
  } };
  const row = { word: 'network', headwords: ['network'], definition: 'meaning', context: { itemID: 9, itemKey: 'ABC', libraryID: 1 } };
  await assert.rejects(saveVocabularyNote(Zotero, row), /只读/); assert.equal(created, 0);
  library.editable = true; assert.equal(await saveVocabularyNote(Zotero, row), 10); assert.ok(written.includes('network'));
  await assert.rejects(saveVocabularyNote(Zotero, { ...row, context: { ...row.context, itemKey: 'changed' } }), /找不到/);
});
test('Reader context keeps the PDF identity, parent title, current page and group route', () => {
  const item = { id: 9, key: 'PDFKEY', libraryID: 3, parentItemID: 4, getField: () => 'attachment' }, parent = { getField: () => 'Paper title' };
  const Zotero = { Items: { get: id => id === 9 ? item : parent }, Libraries: { get: () => ({ libraryType: 'group' }) }, Groups: { getGroupIDFromLibraryID: () => 123 } };
  const chars = [...'research sample'].map(c => ({ c }));
  const view = { _iframeWindow: { wrappedJSObject: { PDFViewerApplication: { pdfViewer: { currentPageNumber: 4 } } } }, _pdfPages: [{ chars }] };
  const manual = readerContext(Zotero, { itemID: 9 }, view); assert.equal(manual.pageIndex, 3); assert.equal(manual.title, 'Paper title'); assert.ok(manual.sourceURL.includes('groups/123/items/PDFKEY?page=4'));
  const click = readerContext(Zotero, { itemID: 9 }, view, undefined, { pageIndex: 0, start: 0, end: 8 }); assert.equal(click.sentence, 'research sample');
  const selection = readerContext(Zotero, { itemID: 9 }, view, { text: 'selected text', position: { pageIndex: 2 } }); assert.equal(selection.pageIndex, 2); assert.equal(selection.sentence, 'selected text');
});
test('History restores independent snapshots, truncates forward navigation and stays bounded', () => {
  const history = new QueryHistory(2); const entry = { query: { text: 'one' }, annotation: { position: { pageIndex: 0 } } };
  history.add(entry); entry.query.text = 'mutated'; history.add({ query: { text: 'two' } });
  assert.equal(history.move(-1).query.text, 'one'); assert.equal(history.canForward, true);
  history.add({ query: { text: 'three' } }); assert.equal(history.canForward, false);
  history.add({ query: { text: 'four' } }); assert.equal(history.entries.length, 2); assert.equal(history.move(-1).query.text, 'three');
});
test('Single, fallback and combined queries keep dictionary attribution and survive one failed source', async () => {
  const dictionaries = ['A', 'bad', 'B', 'B'].map(name => ({ path: name, name }));
  const load = async path => { if (path === 'bad') throw new Error('broken'); return { lookup: async word => path === 'B' ? [{ headword: word, html: 'B definition' }] : [] }; };
  const query = { text: 'network', candidates: ['network'], source: 'click' };
  assert.equal((await queryDictionaries(query, dictionaries, { load })).results.length, 0);
  const fallback = await queryDictionaries(query, dictionaries, { load, mode: 'fallback' });
  assert.equal(fallback.results[0].dictionaryPath, 'B'); assert.equal(fallback.errors.length, 1);
  const combined = await queryDictionaries(query, dictionaries, { load, mode: 'all' });
  assert.equal(combined.groups.length, 2); assert.equal(combined.results.length, 1);
  assert.equal((await queryDictionaries(query, dictionaries, { load, mode: 'all', cancelled: () => true })).results.length, 0);
});
test('Exact hits suppress forms; misses can return both valid roots; internal links are exact', async () => {
  const calls = [];
  const dict = { lookup: async word => { calls.push(word); return ['axes', 'axis', 'axe'].includes(word) ? [{ headword: word, html: word }] : []; } };
  const query = { text: 'axes', candidates: ['axes'], source: 'click' };
  assert.equal((await lookupWithForms(dict, query)).results[0].headword, 'axes'); assert.deepEqual(calls, ['axes']);
  const missed = { lookup: async word => ['axis', 'axe'].includes(word) ? [{ headword: word, html: word }] : [] };
  assert.deepEqual((await lookupWithForms(missed, query)).results.map(r => r.headword), ['axis', 'axe']);
  assert.equal((await lookupWithForms(missed, { ...query, source: 'entry' })).results.length, 0);
  assert.equal((await lookupWithForms(missed, query, { forms: false })).results.length, 0);
});
