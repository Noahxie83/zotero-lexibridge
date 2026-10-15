import test from 'node:test';
import assert from 'node:assert/strict';
import { api, makeDictionary } from './fixtures.mjs';

test('Every query origin preserves translation punctuation before local parsing and history', () => {
  for (const origin of ['click', 'selection', 'manual', 'entry']) {
    const query = api.queryFromText('  Hello, world!  ', origin);
    assert.equal(query.translationText, 'Hello, world!');
    if (origin !== 'entry') assert.equal(query.text, 'Hello, world');
    assert.equal(api.queryFromText('x'.repeat(257), origin), null);
    assert.equal(api.queryFromText(Array(17).fill('word').join(' '), origin), null);
  }
});

test('Dictionary leases retain in-use indexes across more than four sources and release bounded idle entries', async () => {
  const bytes = makeDictionary([['word', '<p>meaning</p>']]);
  const pool = new api.DictionaryPool({ stat: async () => ({type:'regular',size:bytes.length}), read: async (_, {offset,maxBytes}) => bytes.subarray(offset,offset+maxBytes) }, 3);
  assert.equal(typeof pool.acquire, 'function');
  const leases = [];
  for (const path of ['A.mdx','B.mdx','C.mdx','D.mdx','E.mdx']) leases.push(await pool.acquire(path));
  assert.equal(pool.cache.size, 5);
  for (const lease of leases) assert.equal((await lease.dictionary.lookup('word')).length, 1);
  leases.forEach(lease => {lease.release();lease.release();});
  assert.ok(pool.cache.size <= 3);
  pool.clear();
});

function sourceApp() {
  const bytes = makeDictionary([['word', '<p>meaning</p>']]), prefs = new Map();
  const env = { Zotero: { Prefs: {get:key=>prefs.get(key),set:(key,value)=>prefs.set(key,value)},logError(){} }, IOUtils: {
    stat:async path=>({type:path.endsWith('.mdx')?'regular':'directory',size:bytes.length}),
    getChildren:async()=>['/dict/A.mdx','/dict/B.mdx'],
    read:async (_, {offset,maxBytes})=>bytes.subarray(offset,offset+maxBytes),
  } };
  return {env,prefs,app:api.createApp(env,'test')};
}
test('Library refresh preserves an explicit enabled online source selection', async () => {
  const {app,prefs}=sourceApp(); await app.scanFolder('/dict');
  prefs.set('localMDXClick.sources',JSON.stringify(app.getSources().map(source=>({...source,enabled:true}))));
  await app.selectSource('online:google'); await app.scanFolder('/dict');
  assert.equal(prefs.get('localMDXClick.selectedSource'),'online:google');
});
test('Choosing online supersedes a pending local source selection', async () => {
  const {app,prefs,env}=sourceApp(); await app.scanFolder('/dict');
  prefs.set('localMDXClick.sources',JSON.stringify(app.getSources().map(source=>({...source,enabled:true}))));
  let resume; const read=env.IOUtils.read;
  env.IOUtils.read=async(path,options)=>{if(path.endsWith('B.mdx')&&options.offset===0) await new Promise(resolve=>{resume=resolve;});return read(path,options);};
  const old=app.selectSource('local:/dict/B.mdx');
  while(!resume) await new Promise(resolve=>setImmediate(resolve));
  await app.selectSource('online:google'); resume(); assert.equal(await old,false);
  assert.equal(prefs.get('localMDXClick.selectedSource'),'online:google');
});
test('Reload never clears an index still held by another query lease', async () => {
  const bytes=makeDictionary([['word','meaning']]);
  const pool=new api.DictionaryPool({stat:async()=>({type:'regular',size:bytes.length}),read:async(_, {offset,maxBytes})=>bytes.subarray(offset,offset+maxBytes)});
  const lease=await pool.acquire('A.mdx'); let cleared=0; const clear=lease.dictionary.clearCache.bind(lease.dictionary);
  lease.dictionary.clearCache=()=>{cleared++;clear();};
  await pool.load('A.mdx',{reload:true}); assert.equal(cleared,0);
  lease.release(); assert.equal(cleared,1); pool.clear();
});
