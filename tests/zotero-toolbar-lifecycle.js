// Focused F1 acceptance, loaded only by a fresh isolated verification profile.
// Observe the uninstrumented product through its public API and reader DOM.
async function runToolbarLifecycleVerification(config) {
  const report = { kind: 'F1-reader-toolbar-lifecycle', hostVersion: Zotero.version, dataPath: Zotero.DataDirectory.dir, checks: [], ok: false };
  const timers = new Set();
  const schedule = (callback, ms) => {
    const timer = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer); timers.add(timer);
    timer.initWithCallback(() => { timers.delete(timer); callback(); }, ms, Ci.nsITimer.TYPE_ONE_SHOT); return timer;
  };
  const pause = ms => new Promise(resolve => schedule(resolve, ms));
  const save = () => IOUtils.writeUTF8(config.reportPath, JSON.stringify(report, null, 2));
  const require_ = (condition, message) => { if (!condition) throw new Error(message); };
  const check = async (id, fn) => {
    try { const details = await fn(); report.checks.push({ id, ok: true, details }); }
    catch (error) { report.checks.push({ id, ok: false, error: String(error), stack: error.stack }); }
    await save();
  };
  const deadline = schedule(async () => { report.error = 'Verification timeout'; await save(); Services.startup.quit(Ci.nsIAppStartup.eForceQuit); }, 180000);
  try {
    require_(Zotero.DataDirectory.dir === config.dataPath, 'Refusing to use a non-test data directory');
    const app = Zotero.LocalMDXClick;
    const item = await Zotero.Attachments.importFromFile({ file: config.pdfPath });
    const openReader = async inWindow => {
      const reader = await Zotero.Reader.open(item.id, null, { openInWindow: inWindow, allowDuplicate: true });
      await reader._initPromise;
      reader.displayError = error => { report.hostError = String(error); };
      let ready = false;
      for (let i = 0; i < 300 && !ready; i++) {
        try { ready = !!reader._internalReader?._primaryView?._pdfPages?.[0]?.chars?.length; } catch (_) {}
        if (!ready) await pause(100);
      }
      require_(ready, 'Reader did not finish loading'); app.scanReaders(); await pause(400); return reader;
    };
    await app.scanLibrary([config.dictFolder, config.formatsFolder]);
    Zotero.Prefs.set('localMDXClick.sources', JSON.stringify(app.getSources().map(source => ({ ...source, enabled: source.kind === 'local' }))));
    Zotero.Prefs.set('localMDXClick.queryMode', 'single');
    for (const inWindow of [false, true]) {
      const kind = inWindow ? 'detached-window' : 'ordinary-tab';
      let reader = await openReader(inWindow);
      await check(kind + '/before-close', async () => {
        await app.queryReader(reader, 'research');
        const view = reader._internalReader._primaryView;
        const page = view._iframeWindow.wrappedJSObject || view._iframeWindow;
        require_(page.document.querySelector('[data-local-mdx-popup]')?.shadowRoot.querySelector('.result-section'), 'Initial query had no result');
        return { queried: true };
      });
      reader.close(); await pause(1500); app.scanReaders();
      await check(kind + '/refresh-after-close', async () => {
        await app.scanLibrary([config.dictFolder, config.formatsFolder]);
        await app.scanLibrary([config.dictFolder, config.formatsFolder]);
        require_(app.getDictionaries().length === 5, 'Refresh lost a dictionary');
        return { repeatedRefreshes: 2, dictionaries: app.getDictionaries().length };
      });
      await check(kind + '/switch-after-close', async () => {
        const locals = app.getSources().filter(source => source.enabled && source.kind === 'local');
        const target = locals.find(source => source.id !== Zotero.Prefs.get('localMDXClick.selectedSource'));
        require_(target && await app.selectSource(target.id), 'Source switch failed after close');
        require_(Zotero.Prefs.get('localMDXClick.selectedSource') === target.id && app.getPath() === target.path, 'Source selection did not commit');
        return { sourceId: target.id, dictionaryPath: app.getPath() };
      });
      reader = await openReader(inWindow);
      await check(kind + '/reopen-refresh-switch-query', async () => {
        await app.scanLibrary([config.dictFolder, config.formatsFolder]);
        const locals = app.getSources().filter(source => source.enabled && source.kind === 'local');
        const target = locals.find(source => source.id !== Zotero.Prefs.get('localMDXClick.selectedSource'));
        require_(await app.selectSource(target.id), 'Source switch failed after reopen');
        await app.queryReader(reader, 'research');
        const view = reader._internalReader._primaryView;
        const page = view._iframeWindow.wrappedJSObject || view._iframeWindow;
        const root = page.document.querySelector('[data-local-mdx-popup]')?.shadowRoot;
        require_(root?.querySelector('.result-section'), 'Reopened reader query had no result');
        return { sourceId: target.id, queried: true, resultSections: root.querySelectorAll('.result-section').length };
      });
      reader.close(); await pause(1500); app.scanReaders();
      await check(kind + '/second-close-refresh', async () => {
        await app.scanLibrary([config.dictFolder, config.formatsFolder]); return { refreshed: true };
      });
    }
    app.stop(); report.ok = report.checks.length === 10 && report.checks.every(check => check.ok);
  } catch (error) { report.error = String(error); report.stack = error.stack; }
  deadline.cancel(); for (const timer of timers) timer.cancel(); await save();
  Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
}
