// Original generated fixtures only; engine timings, not production-library claims.
import { api, makeDictionary } from '../tests/fixtures.mjs';
import { queryDictionaries, querySources, createQueryScope } from '../src/query-engine.js';
import { mkdtemp, writeFile, open, stat, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
const directory = await mkdtemp(path.join(tmpdir(), 'query-benchmark-'));
const report = { date: '2026-10-15', scope: 'Node engine microbenchmark, five generated MDX dictionaries, 2000 entries each; no UI/real-library timing', baseline: '764da04 sequential API, idle index capacity 3', current: 'bounded concurrency 2, idle index capacity 6', runs: [] };
try {
  const descriptors = [];
  for (let i = 0; i < 5; i++) {
    const file = path.join(directory, `${i}.mdx`);
    await writeFile(file, makeDictionary(Array.from({ length: 2000 }, (_, j) => [`word${String(j).padStart(5, '0')}`, `<p>Definition ${i}/${j}</p>`]), { keyBlockSize: 100, recordChunk: 8192 }));
    descriptors.push({ path: file, name: `Fixture ${i}` });
  }
  for (const implementation of ['baseline', 'current']) for (let repetition = 0; repetition < 3; repetition++) {
    let builds = 0, reads = 0;
    const fs = {
      stat: async file => { builds++; const value = await stat(file); return { type: 'regular', size: value.size }; },
      read: async (file, { offset, maxBytes }) => {
        reads++; const handle = await open(file); const bytes = new Uint8Array(maxBytes);
        try { const result = await handle.read(bytes, 0, maxBytes, offset); return bytes.subarray(0, result.bytesRead); } finally { await handle.close(); }
      },
    };
    const pool = new api.DictionaryPool(fs, implementation === 'baseline' ? 3 : 6);
    pool.activePath = descriptors[0].path;
    global.gc?.(); const before = process.memoryUsage();
    for (const phase of ['cold', 'hot']) {
      const buildStart = builds, readStart = reads, start = performance.now(); let first;
      const query = api.queryFromText('word01000', 'manual');
      const result = implementation === 'baseline'
        ? await queryDictionaries(query, descriptors, { mode: 'all', load: file => pool.load(file) })
        : await querySources(query, descriptors.map((source, i) => ({ ...source, id: `local:${i}`, kind: 'local', enabled: true })), {
          mode: 'all', scope: createQueryScope(), load: file => pool.acquire(file),
          onUpdate: group => { if (first == null && group.results.length) first = performance.now() - start; },
        });
      const total = performance.now() - start;
      global.gc?.(); const memory = process.memoryUsage();
      report.runs.push({ implementation, repetition, phase, firstMs: +(first ?? total).toFixed(2), totalMs: +total.toFixed(2), indexBuilds: builds - buildStart, reads: reads - readStart, cachedIndexes: pool.cache.size, results: result.results.length, retainedHeapDeltaBytes: memory.heapUsed - before.heapUsed, arrayBufferDeltaBytes: memory.arrayBuffers - before.arrayBuffers });
    }
    pool.clear();
  }
  const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  report.medians = [];
  for (const implementation of ['baseline', 'current']) for (const phase of ['cold', 'hot']) {
    const rows = report.runs.filter(row => row.implementation === implementation && row.phase === phase);
    report.medians.push({ implementation, phase, ...Object.fromEntries(['firstMs', 'totalMs', 'indexBuilds', 'cachedIndexes', 'retainedHeapDeltaBytes', 'arrayBufferDeltaBytes'].map(key => [key, median(rows.map(row => row[key]))])) });
  }
  await mkdir(new URL('../docs/verification/', import.meta.url), { recursive: true });
  await writeFile(new URL('../docs/verification/query-performance.json', import.meta.url), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.medians, null, 2));
} finally { await rm(directory, { recursive: true, force: true }); }
