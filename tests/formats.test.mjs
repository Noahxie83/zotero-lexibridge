import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { StarDictDictionary, starDictMeaning } from '../src/stardict.js';
import { DSLDictionary, dslHeadwords, dslMeaning } from '../src/dsl.js';
import { gzipSource, inflateBounded } from '../src/compressed-source.js';
import { scanDirectories } from '../src/directory-library.js';
import { queryDictionaries } from '../src/query-engine.js';
import { formatFS, makeStarDict, dictzip } from './format-fixtures.mjs';
import { api, makeDictionary, source } from './fixtures.mjs';
const dsl = '#NAME "Example DSL"\n#INDEX_LANGUAGE "English"\n#CONTENTS_LANGUAGE "Chinese"\nresearch\n  [m1][b]Research[/b]: ~ means study.[/m]\n  [ref]network[/ref] [s]gb.wav[/s]\nnetwork\nnetworks\n  [i]网络[/i]\nstudy(ing)\n  study meaning\n';
for (const options of [{}, { compressedIndex: true, compressedData: true }, { bits: 64, randomAccess: true }]) test('StarDict loads Unicode, duplicate words and synonyms: ' + JSON.stringify(options), async () => {
  const files = makeStarDict('/dict/S', [['network', '<b>网络</b>'], ['network', '<p>second sense</p>'], ['study', '<p>学习</p>']], { ...options, synonyms: [['studies', 2]] });
  const dictionary = await StarDictDictionary.open(formatFS(files), '/dict/S.ifo');
  assert.equal((await dictionary.lookup('NETWORK')).length, 2); assert.equal((await dictionary.lookup('studies'))[0].headword, 'study');
  assert.ok((await dictionary.lookup('study'))[0].html.includes('学习')); assert.deepEqual(dictionary.browseWords('stud', 0, 1), { words: ['studies'], more: true });
});
test('StarDict typed fields, last-field optimization, XDXF links and binary lengths', () => {
  assert.ok(starDictMeaning(Buffer.from('fəʊn\0plain meaning'), 'tm').includes('phon'));
  assert.ok(starDictMeaning(Buffer.from('mmeaning\0tphonetic\0'), '').includes('meaning'));
  assert.ok(starDictMeaning(Buffer.from('<kref k="network">link</kref><def>meaning</def>'), 'x').includes('entry://network'));
  assert.ok(starDictMeaning(Buffer.from('img:picture.png\nsnd:voice.wav'), 'r').includes('sound://voice.wav'));
  assert.throws(() => starDictMeaning(Buffer.from([87, 255, 255, 255, 255]), ''), /长度/);
  assert.throws(() => starDictMeaning(Buffer.from('mno-terminator'), ''), /结束符/);
});
test('StarDict rejects incomplete companions, wrong metadata and out-of-bounds offsets', async () => {
  const files = makeStarDict('/dict/S', [['word', 'meaning']]);
  const missing = { ...files }; delete missing['/dict/S.idx']; await assert.rejects(StarDictDictionary.open(formatFS(missing), '/dict/S.ifo'), /缺少/);
  const wrong = { ...files, '/dict/S.ifo': Buffer.from(files['/dict/S.ifo'].toString().replace('wordcount=1', 'wordcount=2')) }; await assert.rejects(StarDictDictionary.open(formatFS(wrong), '/dict/S.ifo'), /wordcount/);
  const index = Buffer.from(files['/dict/S.idx']); index.writeUInt32BE(999, 5); await assert.rejects(StarDictDictionary.open(formatFS({ ...files, '/dict/S.idx': index }), '/dict/S.ifo'), /偏移/);
});
test('Dictzip reads only required chunks, reuses its bounded cache and detects malformed tables', async () => {
  const plain = Buffer.from('0123456789'.repeat(60)), packed = dictzip(plain, 64); let reads = 0;
  const input = { size: packed.length, read: async (offset, length) => { reads++; return packed.subarray(offset, offset + length); } };
  const data = await gzipSource(input); const headerReads = reads;
  assert.deepEqual(Buffer.from(await data.read(61, 10)), plain.subarray(61, 71)); assert.equal(reads - headerReads, 2);
  const before = reads; await data.read(61, 10); assert.equal(reads, before); data.clearCache(); await data.read(61, 10); assert.equal(reads - before, 2);
  const corrupt = Buffer.from(packed); corrupt.writeUInt16LE(0, 18); await assert.rejects(gzipSource(source(corrupt)), /分块表/);
  assert.throws(() => inflateBounded(gzipSync(Buffer.alloc(10000)), 100), /限额/);
  await assert.rejects(gzipSource(source(packed.subarray(0, 15))));
});
for (const encoding of ['utf8', 'utf16le']) test('DSL loads aliases, optional headings, markup and local links: ' + encoding, async () => {
  const bytes = Buffer.from((encoding === 'utf16le' ? '\uFEFF' : '') + dsl, encoding), dictionary = await DSLDictionary.open(formatFS({ '/dict/T.dsl': bytes }), '/dict/T.dsl');
  assert.ok((await dictionary.lookup('research'))[0].html.includes('research means study'));
  assert.ok((await dictionary.lookup('research'))[0].html.includes('entry://network')); assert.ok((await dictionary.lookup('research'))[0].html.includes('sound://gb.wav'));
  assert.equal((await dictionary.lookup('networks')).length, 1); assert.equal((await dictionary.lookup('studying')).length, 1); assert.equal((await dictionary.lookup('study')).length, 1);
});
test('DSL gzip/dictzip files, subentries, multiline comments and safe escaped text', async () => {
  const text = '#NAME "DSL"\n{{ multi\nline comment }}\nroot\n  Main meaning\n  @~ sub\n    [b]Sub meaning[/b]\n  @\n';
  for (const packed of [gzipSync(Buffer.from(text)), dictzip(Buffer.from(text))]) {
    const dictionary = await DSLDictionary.open(formatFS({ '/dict/T.dsl.dz': packed }), '/dict/T.dsl.dz');
    assert.ok((await dictionary.lookup('root sub'))[0].html.includes('Sub meaning')); assert.ok(!(await dictionary.lookup('root'))[0].html.includes('comment'));
  }
  assert.deepEqual(dslHeadwords('word(s)'), ['words', 'word']); assert.deepEqual(dslHeadwords('a\\(b\\)'), ['a(b)']);
  const html = dslMeaning('<script>alert(1)</script> \\[b]literal[/b] <<network>>', 'word'); assert.ok(!html.includes('<script>')); assert.ok(html.includes('[b]literal')); assert.ok(html.includes('entry://network'));
  await assert.rejects(DSLDictionary.open(formatFS({ '/dict/T.dsl': Buffer.from('word\n meaning') }), '/dict/T.dsl'), /NAME/);
});
test('MDX, StarDict and DSL scan, switch and combine through the same application', async () => {
  const files = { '/dict/A.mdx': makeDictionary([['research', 'MDX meaning']]), ...makeStarDict('/dict/S', [['research', 'StarDict meaning']]), '/dict/T.dsl': Buffer.from(dsl) };
  const values = new Map(), env = { IOUtils: formatFS(files), Zotero: { Prefs: { get: key => values.get(key), set: (key, value) => values.set(key, value) }, logError() {} } };
  const app = api.createApp(env, 'test'); await app.scanFolder('/dict'); const list = app.getDictionaries();
  assert.equal(list.length, 3); assert.deepEqual(list.map(dictionary => dictionary.format), ['MDX', 'StarDict', 'DSL']);
  const results = await queryDictionaries({ text: 'research', candidates: ['research'], source: 'manual' }, list, { mode: 'all', load: async path => { await app.selectDictionary(path); return app.loadDictionary(); } });
  assert.equal(results.results.length, 3); assert.equal((await app.loadDictionary()).stats.format, 'DSL');
  assert.equal((await scanDirectories(formatFS(files), ['/dict'])).length, 3);
});
test('Formatting warnings remain attached to their own query instead of suppressing later suggestions', async () => {
  const dictionary = await DSLDictionary.open(formatFS({ '/dict/T.dsl': Buffer.from('#NAME "DSL"\nword\n  [private]meaning[/private]\n') }), '/dict/T.dsl');
  const descriptors = [{ path: '/dict/T.dsl', name: 'T' }], load = async () => dictionary;
  const hit = await queryDictionaries({ candidates: ['word'], source: 'entry' }, descriptors, { load }); assert.equal(hit.groups[0].warnings.length, 1); assert.equal(hit.errors.length, 0);
  const miss = await queryDictionaries({ candidates: ['missing'], source: 'entry' }, descriptors, { load }); assert.equal(miss.groups[0].warnings.length, 0); assert.equal(miss.errors.length, 0);
});
test('The dictionary cache retains the active index while evicting older inactive dictionaries', async () => {
  const files = Object.fromEntries(['A', 'B', 'C', 'D'].map(name => ['/dict/' + name + '.mdx', makeDictionary([['word', name]])]));
  const pool = new api.DictionaryPool(formatFS(files)); const original = await pool.load('/dict/A.mdx'); pool.activePath = '/dict/A.mdx';
  for (const name of ['B', 'C', 'D']) await pool.load('/dict/' + name + '.mdx'); assert.equal(pool.cache.size, 3); assert.equal(await pool.load('/dict/A.mdx'), original); assert.ok(!pool.cache.has('/dict/B.mdx'));
  files['/dict/A.mdx'] = new Uint8Array(64); await assert.rejects(pool.load('/dict/A.mdx', { reload: true })); assert.equal(await pool.load('/dict/A.mdx'), original);
});
