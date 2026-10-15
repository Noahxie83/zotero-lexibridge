/* SPDX-License-Identifier: GPL-3.0-or-later */
import { lookupWithForms } from './morphology.js';
import { ONLINE_ENGINE_IDS } from './online-engine-catalog.js';

export const LOCAL_CAPABILITIES = Object.freeze({ browse: true, suggest: true, collect: true, note: true, resources: true, audio: true });
export const ONLINE_CAPABILITIES = Object.freeze({ browse: false, suggest: false, collect: false, note: false, resources: false, audio: false, copy: true });
let nextScope = 0;
const scopePrefix = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
export function createQueryScope() {
  let stopped = false;
  const callbacks = new Set();
  const invoke = fn => { try { fn(); } catch (_) { /* One cleanup must not suppress the others. */ } };
  return Object.freeze({
    id: scopePrefix + '-' + (++nextScope),
    cancelled: () => stopped,
    onCancel(fn) {
      if (stopped) { invoke(fn); return () => {}; }
      callbacks.add(fn); return () => callbacks.delete(fn);
    },
    cancel() {
      if (stopped) return;
      stopped = true;
      const pending = [...callbacks]; callbacks.clear(); pending.forEach(invoke);
    },
  });
}
const cancellation = () => Object.assign(new Error('Query cancelled'), { code: 'CANCELLED' });
function activeWork(scope, work) {
  return new Promise((resolve, reject) => {
    if (scope.cancelled()) { reject(cancellation()); return; }
    const off = scope.onCancel(() => reject(cancellation()));
    Promise.resolve().then(() => {
      if (scope.cancelled()) throw cancellation();
      return work();
    }).then(resolve, reject).finally(off);
  });
}
// Shared by every card/window using this plugin module. Cancelled jobs relinquish
// the lane even if a transport ignores abort or never settles its original promise.
const onlineQueue = [];
let onlineRunning = false;
function drainOnline() {
  if (onlineRunning) return;
  const job = onlineQueue.shift();
  if (!job) return;
  job.off();
  if (job.scope.cancelled()) { job.reject(cancellation()); drainOnline(); return; }
  onlineRunning = true;
  activeWork(job.scope, job.work).then(job.resolve, job.reject).finally(() => { onlineRunning = false; drainOnline(); });
}
function scheduleOnline(scope, work) {
  return new Promise((resolve, reject) => {
    if (scope.cancelled()) { reject(cancellation()); return; }
    const job = { scope, work, resolve, reject, off: () => {} };
    job.off = scope.onCancel(() => {
      const index = onlineQueue.indexOf(job);
      if (index !== -1) onlineQueue.splice(index, 1);
      reject(cancellation());
    });
    onlineQueue.push(job); drainOnline();
  });
}
function snapshot(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(snapshot));
  if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshot(item)])));
  return value;
}
function onlineResults(results, source) {
  if (!Array.isArray(results) || results.length > 16) throw new Error('Invalid online result');
  return results.map(result => {
    if (typeof result?.text !== 'string' || !result.text.trim() || result.text.length > 32768 || result.text.includes('\0') || result.engineId !== source.engineId) throw new Error('Invalid online result');
    return { type: 'online', sourceId: source.id, text: result.text, engineId: source.engineId,
      ...(typeof result.sourceLanguage === 'string' ? { sourceLanguage: result.sourceLanguage } : {}),
      ...(typeof result.targetLanguage === 'string' ? { targetLanguage: result.targetLanguage } : {}),
    };
  });
}
export async function querySources(query, sources, { load, mode = 'single', forms = true, scope = createQueryScope(), onUpdate, translate } = {}) {
  const selected = mode === 'single' ? sources.slice(0, 1) : [...sources];
  const groups = selected.map(source => ({ queryId: scope.id, sourceId: source.id, source: { ...source }, kind: source.kind,
    capabilities: source.kind === 'local' ? LOCAL_CAPABILITIES : ONLINE_CAPABILITIES,
    status: 'queued', results: [], attempts: [], errors: [], warnings: [],
  }));
  const emit = group => { if (!scope.cancelled() && onUpdate) onUpdate(snapshot(group)); };
  groups.forEach(emit);
  const execute = async group => {
    const source = group.source, start = Date.now();
    const run = async () => {
      if (scope.cancelled()) throw cancellation();
      group.status = 'running'; emit(group);
      if (scope.cancelled()) throw cancellation();
      if (source.kind === 'online') {
        if (!ONLINE_ENGINE_IDS.includes(source.engineId) || typeof translate !== 'function') throw new Error('Unsupported online engine');
        group.results = onlineResults(await translate(query, source, scope), source);
        return;
      }
      if (source.kind !== 'local') throw new Error('Unsupported source kind');
      let lease;
      try {
        lease = await load(source.path);
        if (scope.cancelled()) return;
        const dictionary = lease?.dictionary || lease;
        const found = await lookupWithForms(dictionary, query, { forms, cancelled: scope.cancelled });
        if (scope.cancelled()) return;
        group.results = found.results.map(result => ({ ...result, type: 'local', sourceId: source.id, dictionaryPath: source.path, dictionaryName: source.name }));
        group.attempts = found.attempts;
        group.errors = found.errors;
        group.warnings = [...new Set(found.results.flatMap(result => result.warnings || []))];
        group.stats = dictionary.stats;
      } finally { if (typeof lease?.release === 'function') await lease.release(); }
    };
    try {
      if (source.kind === 'online') await scheduleOnline(scope, run);
      else await activeWork(scope, run);
      group.status = group.results.length ? 'ready' : group.errors.length ? 'error' : 'empty';
    } catch (error) {
      if (scope.cancelled() || error.code === 'CANCELLED') group.status = 'cancelled';
      else {
        group.status = error.code === 'COOLDOWN' ? 'cooldown' : 'error';
        group.errors.push(String(error.message || error));
        if (Number.isFinite(error.retryAt)) group.retryAt = error.retryAt;
      }
    }
    if (scope.cancelled()) { group.status = 'cancelled'; group.results = []; }
    group.elapsedMs = Date.now() - start; emit(group);
  };
  let visited = groups;
  if (mode === 'all') {
    let localIndex = 0;
    const locals = groups.filter(group => group.kind !== 'online');
    const worker = async () => { while (localIndex < locals.length && !scope.cancelled()) await execute(locals[localIndex++]); };
    await Promise.all([worker(), worker(), ...groups.filter(group => group.kind === 'online').map(execute)]);
  } else {
    visited = [];
    for (const group of groups) {
      if (scope.cancelled()) break;
      visited.push(group); await execute(group);
      if (mode === 'single' || group.results.length) break;
    }
  }
  if (scope.cancelled()) for (const group of groups) { group.status = 'cancelled'; group.results = []; }
  const finalGroups = visited.map(snapshot);
  return { groups: finalGroups, results: finalGroups.flatMap(group => group.results), errors: finalGroups.flatMap(group => group.errors.map(error => group.source.name + '：' + error)) };
}
