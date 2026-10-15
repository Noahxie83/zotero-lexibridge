import test from 'node:test';
import assert from 'node:assert/strict';
import { api, makeDictionary } from './fixtures.mjs';

// Render through the registered public toolbar callback. Only the DOM/host
// boundary is stubbed; updateUI, library loading and source switching are real.
async function toolbarApp() {
  const prefs = new Map(), bytes = makeDictionary([['word', '<p>meaning</p>']]);
  let renderToolbar;
  const env = {
    Zotero: {
      Prefs: { get: key => prefs.get(key), set: (key, value) => prefs.set(key, value) },
      PreferencePanes: { async register() {} },
      Reader: { _readers: [], registerEventListener(_, callback) { renderToolbar = callback; }, unregisterEventListener() {} },
      logError(error) { throw error; },
    },
    IOUtils: {
      stat: async path => ({ type: path.endsWith('.mdx') ? 'regular' : 'directory', size: bytes.length }),
      getChildren: async () => ['/dict/A.mdx', '/dict/B.mdx'],
      read: async (_, { offset, maxBytes }) => bytes.subarray(offset, offset + maxBytes),
    },
    setInterval() { return 1; }, clearInterval() {},
  };
  const doc = { createElementNS(_, tag) {
    return { tag, ownerDocument: doc, style: {}, dataset: {}, children: [], isConnected: true,
      setAttribute() {}, addEventListener() {}, append(...nodes) { this.children.push(...nodes); },
      replaceChildren() { this.children = []; }, remove() { this.isConnected = false; },
    };
  } };
  const app = api.createApp(env, 'toolbar-lifecycle-test'); await app.start();
  const render = () => {
    const nodes = []; renderToolbar({ reader: { type: 'pdf' }, doc, append(...items) { nodes.push(...items); } });
    return { master: nodes[0], selector: nodes[1], query: nodes[2] };
  };
  return { app, prefs, render };
}

for (const property of ['isConnected', 'disabled']) {
  test(`A toolbar ${property} exception evicts only that node and never blocks later refreshes`, async () => {
    const { app, prefs, render } = await toolbarApp();
    try {
      const dead = render(), detached = render(), live = render();
      let failures = 0, disconnectedReads = 0;
      Object.defineProperty(dead.query, property, property === 'isConnected'
        ? { get() { failures++; throw new TypeError("can't access dead object"); } }
        : { set() { failures++; throw new TypeError("can't access dead object"); } });
      Object.defineProperty(detached.query, 'isConnected', { get() { disconnectedReads++; return false; } });
      prefs.set('localMDXClick.enabled', false);
      await assert.doesNotReject(app.scanLibrary(['/dict']));
      assert.equal(live.query.disabled, true, 'A later query button must still update');
      assert.equal(live.master.textContent, '词译桥', 'Subsequent toolbar collections must also update');
      assert.equal(failures, 1, 'Throwing node must be evicted, not retried by each updateUI call');
      assert.equal(disconnectedReads, 1, 'Disconnected node must also be removed');

      prefs.set('localMDXClick.enabled', true);
      const next = app.getSources().find(source => source.kind === 'local' && source.path === '/dict/B.mdx');
      assert.equal(await app.selectSource(next.id), true);
      await assert.doesNotReject(app.scanLibrary(['/dict']));
      assert.equal(live.query.disabled, false);
      assert.equal(live.master.textContent, '词译桥 ✓');
      assert.equal(failures, 1, 'Later source changes must not revisit a dead node');
      assert.equal(disconnectedReads, 1);
      const reopened = render();
      assert.equal(reopened.query.disabled, false, 'A newly opened reader must remain usable');
    } finally { app.stop(); }
  });
}
