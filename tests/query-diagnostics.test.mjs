import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowQueryDiagnostics } from '../src/query-controls.js';

test('query diagnostics are limited to per-source empty and failure states', () => {
  for (const status of ['empty', 'error', 'cooldown']) assert.equal(shouldShowQueryDiagnostics({ status }), true, status);
  for (const status of ['idle', 'queued', 'running', 'ready', 'cancelled']) assert.equal(shouldShowQueryDiagnostics({ status }), false, status);
  assert.equal(shouldShowQueryDiagnostics(null), false);
});

test('successful results stay quiet even when the group carries warnings', () => {
  assert.equal(shouldShowQueryDiagnostics({ status: 'ready', results: [{ text: 'translation' }], warnings: ['resource hint'] }), false);
  assert.equal(shouldShowQueryDiagnostics({ status: 'ready', results: [], warnings: ['warning'] }), false);
});
