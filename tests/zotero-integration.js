// Run only by the isolated verification copy, never by the shipped addon.
async function runZoteroVerification(config) {
  Zotero.__localQueryTrace = [];
  const report = { version: config.version, steps: [], ok: false };
  const win = Zotero.getMainWindow(), timers = new Set();
  const schedule = (callback, ms) => {
    const timer = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer); timers.add(timer);
    timer.initWithCallback(() => { timers.delete(timer); callback(); }, ms, Ci.nsITimer.TYPE_ONE_SHOT);
    return timer;
  };
  const pause = ms => new Promise(resolve => schedule(resolve, ms));
  const save = () => IOUtils.writeUTF8(config.reportPath, JSON.stringify(report, null, 2));
  const step = async (name, details) => { report.steps.push({ name, details }); await save(); };
  const require = (condition, message) => { if (!condition) throw new Error(message); };
  const deadline = schedule(async () => { report.error = 'Verification timeout'; await save(); Services.startup.quit(Ci.nsIAppStartup.eForceQuit); }, 120000);
  try {
    require(Zotero.DataDirectory.dir === config.dataPath, 'Refusing to modify a non-test data directory');
    await step('isolated-profile', { version: Zotero.version, dataPath: Zotero.DataDirectory.dir });
    const app = Zotero.LocalMDXClick;
    require(Zotero.LocalDictionary === app, 'Renamed API lost compatibility alias');
    require(!app.getPath(), 'Fresh profile should have no preset dictionary');
    const item = await Zotero.Attachments.importFromFile({ file: config.pdfPath });
    await step('imported-test-pdf', { id: item.id });
    let reader = await Zotero.Reader.open(item.id); await reader._initPromise;
    await step('opened-test-reader', { id: item.id });
    // Record host persistence errors instead of opening a modal test dialog.
    reader.displayError = error => { report.hostError = String(error); void save(); };
    let view, pdfWin;
    for (let i = 0; i < 300; i++) {
      view = reader._internalReader?._primaryView;
      pdfWin = view?._iframeWindow?.wrappedJSObject || view?._iframeWindow;
      if (view?._pdfPages?.[0]?.chars?.length && pdfWin?.document.querySelector('.textLayer span')) break;
      await pause(100);
    }
    require(view?._pdfPages?.[0]?.chars?.length, 'No PDF character geometry');
    await step('pdf-geometry', { characters: view._pdfPages[0].chars.length });
    app.scanReaders(); await pause(300);
    const chars = view._pdfPages[0].chars, selected = chars.slice(0, 8);
    const rects = selected.map(char => char.rect);
    require(rects.every(rect => rect?.length === 4), 'Unexpected PDF geometry');
    const rect = [Math.min(...rects.map(r => r[0])), Math.min(...rects.map(r => r[1])), Math.max(...rects.map(r => r[2])), Math.max(...rects.map(r => r[3]))];
    const ranges = [{ pageIndex: 0, anchorOffset: 0, headOffset: 8, collapsed: false, sortIndex: '00000|000000|00000', text: 'research', position: { pageIndex: 0, rects: [rect] } }];
    const choose = () => view._setSelectionRanges(Cu.cloneInto(ranges, reader._iframeWindow));
    const popup = () => pdfWin.document.querySelector('[data-local-mdx-popup]')?.shadowRoot;
    async function menu() {
      popup()?.querySelector('header button')?.click(); choose();
      for (let i = 0; i < 100 && !popup()?.querySelector('.annotation-actions button'); i++) await pause(50);
      const root = popup(); require(root?.querySelectorAll('.annotation-actions button').length === 2, 'Missing annotation controls');
      return root;
    }
    for (const [type, color, index] of [['highlight', '#ff6666', 0], ['underline', '#2ea8e5', 1]]) {
      const root = await menu(); root.querySelector(`[data-color="${color}"]`).click();
      await step('selected-color-' + type, { color });
      root.querySelectorAll('.annotation-actions button')[index].click();
      await step('clicked-' + type, { status: root.querySelector('.source').textContent });
      for (let i = 0; i < 150 && !root.querySelector('.source').textContent.includes('已保存'); i++) {
        if (root.querySelector('.source').textContent.includes('失败')) throw new Error(root.querySelector('.source').textContent);
        await pause(50);
      }
      require(root.querySelector('.source').textContent.includes('已保存'), 'Annotation action did not finish');
      await step('accepted-' + type, { status: root.querySelector('.source').textContent });
      for (let i = 0; i < 150 && !item.getAnnotations().some(annotation => annotation.annotationType === type); i++) await pause(50);
      const saved = item.getAnnotations().find(annotation => annotation.annotationType === type);
      await step('annotation-diagnostics-' + type, {
        items: item.getAnnotations().map(annotation => ({ type: annotation.annotationType, color: annotation.annotationColor, text: annotation.annotationText })),
        reader: JSON.parse(JSON.stringify(reader._internalReader._state.annotations)),
        errors: Zotero.getErrors(true).slice(-10),
      });
      require(saved?.annotationColor === color && saved.annotationText === 'research', 'Incorrect stored annotation');
      require(JSON.parse(saved.annotationPosition).rects.length > 0, 'Missing stored annotation position');
      await step('stored-' + type, { type: saved.annotationType, color: saved.annotationColor, text: saved.annotationText, key: saved.key });
    }
    await app.scanFolder(config.dictFolder);
    Zotero.Prefs.set('localMDXClick.queryMode', 'all');
    await app.queryReader(reader, 'research');
    require(popup()?.querySelectorAll('.result-section').length === 2, 'Combined query did not show both dictionaries');
    require([...popup().querySelectorAll('.source-diagnostic')].every(node => node.hidden && node.getBoundingClientRect().height === 0), 'Successful local sources exposed diagnostics or reserved space');
    require(popup().querySelector('.query-diagnostics')?.hidden && popup().querySelector('.query-diagnostics').getBoundingClientRect().height === 0, 'Successful local sources exposed global diagnostics or reserved space');
    await step('combined-query', { sources: 2 });
    const allSources = app.getSources(), savedSelectedSource = Zotero.Prefs.get('localMDXClick.selectedSource');
    const firstLocal = allSources.find(source => source.kind === 'local');
    Zotero.Prefs.set('localMDXClick.selectedSource', firstLocal.id); Zotero.Prefs.set('localMDXClick.queryMode', 'single');
    await app.queryReader(reader, 'bulk');
    const bulkRoot = popup(), bulkGroup = bulkRoot.querySelector('.query-source');
    require(bulkGroup?.querySelectorAll('.result-section').length === 12 && bulkGroup.querySelector('.source-status').textContent === '已完成', 'Show-more local fixture did not complete');
    require(bulkGroup.querySelector('.source-diagnostic').hidden && bulkGroup.querySelector('.source-diagnostic').getBoundingClientRect().height === 0 && bulkRoot.querySelector('.query-diagnostics').hidden && bulkRoot.querySelector('.query-diagnostics').getBoundingClientRect().height === 0, 'Successful local query exposed diagnostics or reserved space');
    const bulkMore = [...bulkRoot.querySelectorAll('button')].find(button => button.textContent.startsWith('显示更多释义'));
    require(bulkMore, 'Local fixture did not expose show-more control'); bulkMore.click();
    for (let i = 0; i < 100 && popup().querySelectorAll('.result-section').length < 13; i++) await pause(20);
    require(popup().querySelectorAll('.result-section').length === 13 && popup().querySelector('.source-diagnostic').hidden && popup().querySelector('.source-diagnostic').getBoundingClientRect().height === 0 && popup().querySelector('.query-diagnostics').hidden && popup().querySelector('.query-diagnostics').getBoundingClientRect().height === 0, 'Show-more or async resources exposed successful diagnostics or reserved space');
    await app.queryReader(reader, 'absent-diagnostic-term');
    const missGroup = popup().querySelector('.query-source');
    require(missGroup.querySelector('.source-status').textContent === '未找到结果' && !missGroup.querySelector('.source-diagnostic').hidden, 'Empty lookup hid its diagnostic');
    await app.queryReader(reader, 'research');
    let recoveredRoot = popup();
    require(recoveredRoot.querySelector('.query-source .source-status').textContent === '已完成' && recoveredRoot.querySelector('.source-diagnostic').hidden && recoveredRoot.querySelector('.query-diagnostics').hidden, 'Successful retry retained an old diagnostic');
    require(recoveredRoot.querySelectorAll('.result-section').length === 1, 'Recovery result rendering changed');
    Zotero.Prefs.set('localMDXClick.selectedSource', savedSelectedSource); Zotero.Prefs.set('localMDXClick.queryMode', 'all');
    await app.queryReader(reader, 'research');
    const researchRoot = popup();
    for (let i = 0; i < 100 && !researchRoot.querySelector('iframe')?.contentDocument?.querySelector('[data-mdx-entry]'); i++) await pause(50);
    const frame = researchRoot.querySelector('iframe').contentDocument;
    require(frame.querySelector('[data-mdx-entry]'), 'Native dictionary frame did not mount');
    require(frame.defaultView.getComputedStyle(frame.body).fontSize === '16px', 'Unexpected default definition size');
    frame.querySelector('[data-mdx-entry]').click();
    for (let i = 0; i < 100 && !popup()?.querySelector('.card')?.getAttribute('aria-label').includes('network'); i++) await pause(50);
    require(popup()?.querySelector('.card').getAttribute('aria-label').includes('network'), 'Internal link failed');
    require(popup().querySelectorAll('.query-source').length === 1, 'Internal entry escaped its original dictionary');
    require(popup().querySelector('.source-diagnostic').hidden && popup().querySelector('.query-diagnostics').hidden, 'Successful history destination exposed diagnostics');
    const action = (root, text) => [...root.querySelectorAll('button')].find(button => button.textContent === text);
    action(popup(), '返回').click();
    for (let i = 0; i < 100 && !popup()?.querySelector('.card')?.getAttribute('aria-label').includes('research'); i++) await pause(50);
    require(popup()?.querySelector('.card').getAttribute('aria-label').includes('research') && popup().querySelector('.source-diagnostic').hidden && popup().querySelector('.query-diagnostics').hidden, 'Back navigation failed or restored stale diagnostics');
    await step('entry-link-and-history', { restored: true });
    action(popup(), '固定').click(); pdfWin.dispatchEvent(new pdfWin.Event('scroll')); require(popup(), 'Pinned popup closed on scroll');
    await step('pinned-popup', { retained: true });
    action(popup(), '收藏').click(); require(app.vocabulary.list().length === 1, 'Vocabulary did not persist');
    const collected = app.vocabulary.list()[0]; require(collected.context.itemKey === item.key && collected.context.sourceURL.includes(item.key), 'Vocabulary lost source identity');
    action(popup(), '写入笔记').click();
    for (let i = 0; i < 100 && !popup()?.querySelector('.source').textContent.includes('已保存至'); i++) await pause(50);
    require(popup()?.querySelector('.source').textContent.includes('已保存至'), 'Note save failed: ' + popup()?.querySelector('.source').textContent);
    await step('vocabulary-and-note', { word: collected.word, itemKey: collected.context.itemKey });
    const preferencesFrame = pdfWin.document.createElement('iframe'); preferencesFrame.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;';
    const frameReady = new Promise(resolve => preferencesFrame.addEventListener('load', resolve, { once: true }));
    preferencesFrame.srcdoc = '<!doctype html><html><body></body></html>'; pdfWin.document.body.append(preferencesFrame); await frameReady;
    const preferencesDoc = preferencesFrame.contentDocument;
    // Mount shipped HTML controls in their own document. Content frames cannot
    // instantiate the privileged XUL preferences container.
    preferencesDoc.body.innerHTML = config.preferencesXML.replace(/html:/g, ''); preferencesDoc.querySelector('vbox').removeAttribute('onload');
    const dictionaryPaths = app.getDictionaries().map(dictionary => dictionary.path);
    Zotero.Prefs.set('localMDXClick.resources', JSON.stringify({ [app.getPath()]: { extraArchives: ['test-first.mdd', 'test-second.mdd'] } }));
    app.mountPreferences(preferencesFrame.contentWindow);
    const changeSetting = (key, value) => { const control = preferencesDoc.querySelector('[data-setting="' + key + '"]'); require(control, 'Missing preference: ' + key); control.value = value; control.dispatchEvent(new preferencesFrame.contentWindow.Event('change', { bubbles: true })); };
    changeSetting('recursive', 'true'); require(Zotero.Prefs.get('localMDXClick.recursive') === true, 'Recursive preference must be a boolean'); changeSetting('recursive', 'false');
    changeSetting('fontSize', '18.4'); require(Zotero.Prefs.get('localMDXClick.fontSize') === 18, 'Font size was not rounded');
    const resourceRow = [...preferencesDoc.querySelectorAll('#local-mdx-enhancements p')].find(row => row.textContent.startsWith('test-first.mdd'));
    action(resourceRow, '移除').click(); await pause(100);
    require(JSON.parse(Zotero.Prefs.get('localMDXClick.resources'))[app.getPath()].extraArchives.length === 1, 'MDD removal failed');
    const dictionaryRow = [...preferencesDoc.querySelectorAll('#local-mdx-enhancements p')].find(row => row.textContent.startsWith('B '));
    action(dictionaryRow, '↑').click(); await pause(100); require(app.getDictionaries()[0].path === dictionaryPaths[1], 'Dictionary priority failed');
    require(preferencesDoc.querySelector('#local-mdx-enhancements').textContent.includes('research'), 'Vocabulary record missing from settings');
    Zotero.Prefs.set('localMDXClick.resources', '{}'); app.resetResources(); preferencesFrame.remove();
    await step('preferences-controls', { recursive: true, resourceRemoval: true, ordering: true, vocabulary: true });
    await app.queryReader(reader, 'studies'); require(popup()?.querySelector('.body').textContent.includes('study'), 'Word form lookup failed');
    await step('word-form', { query: 'studies', hit: 'study' });
    await app.queryReader(reader);
    const manual = popup(); manual.querySelector('.query-form input').value = 'network'; manual.querySelector('.query-form button').click();
    for (let i = 0; i < 100 && !popup()?.querySelector('.card')?.getAttribute('aria-label').includes('network'); i++) await pause(50);
    require(popup()?.querySelector('.card').getAttribute('aria-label').includes('network'), 'Manual query submit failed');
    await app.queryReader(reader, 'netwrok'); require(popup()?.querySelector('.body').textContent.includes('network'), 'Spelling suggestion failed');
    await step('manual-query-and-spelling', { available: true });
    Zotero.Prefs.set('localMDXClick.theme', 'dark'); Zotero.Prefs.set('localMDXClick.fontSize', 20);
    await app.queryReader(reader, 'research');
    for (let i = 0; i < 100 && !popup()?.querySelector('iframe')?.contentDocument?.querySelector('[data-mdx-audio]'); i++) await pause(50);
    require(popup()?.querySelector('.card').style.fontSize === '20px', 'Popup font size ignored');
    require(popup().querySelector('iframe').contentDocument.defaultView.getComputedStyle(popup().querySelector('iframe').contentDocument.body).fontSize === '20px', 'Native font size ignored');
    const audioButton = action(popup(), '发音'); require(!audioButton.disabled, 'Audio action unavailable');
    // Synthetic .click() has no media user activation. Exercise the actual
    // reader button with trusted input instead of disabling autoplay policy.
    const audioRect = audioButton.getBoundingClientRect(), utils = Cu.unwaiveXrays(pdfWin).windowUtils;
    utils.sendMouseEvent('mousedown', audioRect.x + audioRect.width / 2, audioRect.y + audioRect.height / 2, 0, 1, 0);
    utils.sendMouseEvent('mouseup', audioRect.x + audioRect.width / 2, audioRect.y + audioRect.height / 2, 0, 1, 0);
    for (let i = 0; i < 100 && action(popup(), '重播').disabled; i++) await pause(50);
    require(!action(popup(), '重播').disabled, 'Audio did not play: ' + popup()?.querySelector('.source').textContent);
    await step('theme-size-and-audio', { fontSize: 20, replay: true });
    popup()?.querySelector('header button')?.click(); choose();
    for (let i = 0; i < 100 && (!popup() || action(popup(), '收藏').disabled); i++) await pause(50);
    action(popup(), '收藏').click(); require(app.vocabulary.list()[0].context.sentence.includes('research'), 'Selected text missing from vocabulary context');
    await step('selected-text-context', { sentence: app.vocabulary.list()[0].context.sentence });
    await app.queryReader(reader);
    require(popup()?.querySelector('.card')?.getAttribute('aria-label').includes('research'), 'Toolbar query ignored selected text');
    action(popup(), '收藏').click(); require(app.vocabulary.list()[0].context.sentence === 'research', 'Toolbar query lost selected context');
    await step('toolbar-selected-query', { word: 'research', sentence: 'research' });
    const eventTools = { Components, ChromeUtils, Cc, Ci, Cu, KeyboardEvent: win.KeyboardEvent, SpecialPowers: { ChromeUtils, Cc, Ci, Cu } };
    eventTools.window = eventTools;
    Services.scriptloader.loadSubScript('chrome://remote/content/external/EventUtils.js', eventTools);
    popup().querySelector('.query-form input').focus();
    eventTools.synthesizeKey('d', { ctrlKey: true, altKey: true }, Cu.unwaiveXrays(pdfWin));
    for (let i = 0; i < 100 && (!popup() || action(popup(), '收藏')?.disabled !== false); i++) await pause(50);
    require(action(popup(), '收藏')?.disabled === false, 'Shortcut popup not ready: ' + popup()?.querySelector('.source')?.textContent);
    action(popup(), '收藏').click(); require(app.vocabulary.list()[0].context.sentence === 'research', 'Shortcut query lost selected context');
    await step('shortcut-selected-context', { sentence: 'research' });
    popup().querySelector('.query-form input').value = 'network'; popup().querySelector('.query-form button').click();
    for (let i = 0; i < 100 && (!popup()?.querySelector('.card')?.getAttribute('aria-label').includes('network') || action(popup(), '收藏')?.disabled !== false); i++) await pause(50);
    action(popup(), '收藏').click(); require(app.vocabulary.list()[0].context.sentence === '', 'Typed query retained an unrelated sentence');
    require(app.vocabulary.list()[0].context.itemKey === item.key, 'Typed query lost PDF identity');
    await step('manual-context-cleared', { word: 'network', sentence: '' });
    await app.scanLibrary([config.dictFolder, config.formatsFolder], dictionaryPaths[0]);
    Zotero.Prefs.set('localMDXClick.queryMode', 'all'); await app.queryReader(reader, 'research');
    require(popup()?.querySelectorAll('.result-section').length === 4, 'Combined MDX/StarDict/DSL query failed');
    await step('mixed-format-query', { sources: 4, formats: ['MDX', 'StarDict', 'DSL'] });
    const pointer = (target, type, x, y, id = 71) => target.dispatchEvent(new pdfWin.PointerEvent(type, Cu.cloneInto({ bubbles: true, composed: true, button: 0, pointerId: id, isPrimary: true, clientX: x, clientY: y }, pdfWin)));
    const clearSelection = () => view._setSelectionRanges(Cu.cloneInto([], reader._iframeWindow));
    const glyphRect = view._pdfPages[0].chars[3].rect;
    const pageView = pdfWin.PDFViewerApplication.pdfViewer.getPageView(0);
    const point = pageView.viewport.convertToViewportPoint((glyphRect[0] + glyphRect[2]) / 2, (glyphRect[1] + glyphRect[3]) / 2);
    const bounds = pdfWin.document.querySelector('.page .canvasWrapper').getBoundingClientRect();
    const clickX = bounds.left + point[0] * bounds.width / pageView.viewport.width, clickY = bounds.top + point[1] * bounds.height / pageView.viewport.height;
    popup()?.querySelector('header button')?.click(); clearSelection();
    const clickTarget = pdfWin.document.elementFromPoint(clickX, clickY);
    require(clickTarget?.closest('.page'), 'Click test target outside PDF');
    for (const clickEnabled of [false, true]) for (const selectionEnabled of [false, true]) {
      Zotero.Prefs.set('localMDXClick.clickEnabled', clickEnabled); Zotero.Prefs.set('localMDXClick.selectionEnabled', selectionEnabled);
      popup()?.querySelector('header button')?.click(); clearSelection(); await pause(20);
      eventTools.synthesizeMouseAtPoint(clickX, clickY, {}, Cu.unwaiveXrays(pdfWin)); await pause(100);
      await step('trigger-click-probe', { trace: Zotero.__localQueryTrace.splice(0), errors: Zotero.getErrors(true).slice(-3), clickEnabled, selectionEnabled, popup: !!popup(), collapsed: view._isSelectionCollapsed?.(), action: view.action?.type, tool: view._tool?.type, selection: String(pdfWin.getSelection()), ranges: JSON.parse(JSON.stringify(view._selectionRanges)), clickX, clickY, target: clickTarget.outerHTML?.slice(0, 240) });
      require(!!popup() === clickEnabled, 'Wrong click combination ' + clickEnabled + '/' + selectionEnabled);
      popup()?.querySelector('header button')?.click(); choose(); await pause(80);
      require(!!popup()?.querySelector('.annotation-actions'), 'Selection-disabled lost annotation tools');
      require(!!popup()?.querySelector('.query-source') === selectionEnabled, 'Wrong selection combination');
      await app.queryReader(reader, 'research'); require(popup()?.querySelectorAll('.result-section').length === 4, 'Manual query blocked by switches');
    }
    await step('four-trigger-combinations', { clickAndSelection: true, clickOnly: true, selectionOnly: true, neither: true, manualAndAnnotations: true });
    Zotero.Prefs.set('localMDXClick.clickEnabled', true); Zotero.Prefs.set('localMDXClick.selectionEnabled', true);
    const savedSources = app.getSources(), savedSelected = Zotero.Prefs.get('localMDXClick.selectedSource');
    const onlineSource = savedSources.find(source => source.kind === 'online' && source.engineId === 'google');
    const requestHTTP = Zotero.HTTP.request; let delayedResolve, mockAborts = 0, mockQueries = [], mockStatus = 200;
    Zotero.HTTP.request = (method, url, options) => {
      if (!url.startsWith('https://translate.googleapis.com/translate_a/single')) return requestHTTP.call(Zotero.HTTP, method, url, options);
      mockQueries.push(decodeURIComponent(url.split('&q=')[1]));
      return new Promise((resolve, reject) => {
        options.requestObserver({ abort() { mockAborts++; reject(new Error('cancelled mock')); } });
        delayedResolve = () => resolve({ status: mockStatus, responseText: mockStatus === 200 ? JSON.stringify([[['模拟翻译：你好！', 'Hello, world!']], null, 'en']) : JSON.stringify({ error: 'mock rate limit' }), getResponseHeader: name => name === 'Retry-After' ? '0' : null });
      });
    };
    try {
      Zotero.Prefs.set('localMDXClick.sources', JSON.stringify(savedSources.map(source => ({ ...source, enabled: source.kind === 'online' }))));
      Zotero.Prefs.set('localMDXClick.selectedSource', onlineSource.id); Zotero.Prefs.set('localMDXClick.queryMode', 'single');
      clearSelection(); const pending = app.queryReader(reader, 'Hello, world!');
      for (let i = 0; i < 100 && !delayedResolve; i++) await pause(10);
      require(delayedResolve, 'Online-only failed to start HTTP');
      const onlineRoot = popup(), host = onlineRoot.host, header = onlineRoot.querySelector('header');
      const before = host.getBoundingClientRect();
      pointer(header, 'pointerdown', before.left + 180, before.top + 12, 81);
      pointer(pdfWin, 'pointermove', before.left + 230, before.top + 52, 81); pointer(pdfWin, 'pointerup', before.left + 230, before.top + 52, 81);
      const dragged = { left: host.style.left, top: host.style.top };
      await step('drag-probe', { trace: Zotero.__localQueryTrace.splice(0), before: { left: before.left, top: before.top, width: before.width, height: before.height }, dragged, viewport: { width: pdfWin.innerWidth, height: pdfWin.innerHeight } });
      require(Math.hypot(parseFloat(dragged.left) - before.left, parseFloat(dragged.top) - before.top) > 5, 'Popup did not drag');
      delayedResolve(); await pending;
      require(host.style.left === dragged.left && host.style.top === dragged.top, 'Slow result reset dragged popup');
      require(onlineRoot.querySelector('.body').textContent.includes('模拟翻译'), 'Online text absent');
      require(onlineRoot.querySelector('.source-diagnostic').hidden && onlineRoot.querySelector('.source-diagnostic').getBoundingClientRect().height === 0 && onlineRoot.querySelector('.query-diagnostics').hidden && onlineRoot.querySelector('.query-diagnostics').getBoundingClientRect().height === 0, 'Successful online translation exposed diagnostics or reserved space');
      require(!action(onlineRoot, '浏览词目') && action(onlineRoot, '收藏').disabled && action(onlineRoot, '写入笔记').disabled && action(onlineRoot, '发音').disabled, 'Online capability leak');
      require(!onlineRoot.querySelector('iframe'), 'Online entered native resources');
      require(onlineRoot.querySelector('.dictionary-choice select').value === onlineSource.id && !onlineRoot.querySelector('.dictionary-choice select').disabled, 'Online source selector failed');
      action(onlineRoot, '复制').click(); require(onlineRoot.querySelector('.source-footer').textContent === '已复制翻译', 'Online copy failed');
      require(mockQueries[0] === 'Hello, world!', 'Translation punctuation lost');
      onlineRoot.querySelector('.query-form input').value = 'network'; onlineRoot.querySelector('.query-form button').click();
      await pause(20); require(popup().host.style.left === dragged.left && popup().host.style.top === dragged.top, 'Manual query reset position');
      delayedResolve(); await pause(30);
      action(popup(), '返回').click(); await pause(20); require(popup().host.style.left === dragged.left, 'History reset position'); delayedResolve(); await pause(30);
      const closing = app.queryReader(reader, 'closing'); await pause(20); popup()?.querySelector('header button')?.click(); await closing;
      require(mockAborts > 0 && !popup(), 'Close failed to cancel online');
      await step('online-only-and-drag', { transport: 'offline mock in real Zotero', punctuation: true, slowResultPreserved: true, manualAndHistoryPreserved: true, localActionsDisabled: true, aborts: mockAborts });
      Zotero.Prefs.set('localMDXClick.sources', JSON.stringify(savedSources.map(source => ({ ...source, enabled: true }))));
      Zotero.Prefs.set('localMDXClick.queryMode', 'all'); mockStatus = 429;
      delayedResolve = undefined;
      const mixedPending = app.queryReader(reader, 'research');
      for (let i = 0; i < 100 && !delayedResolve; i++) await pause(10);
      require(delayedResolve, 'Mixed-query mock did not start'); delayedResolve(); await mixedPending;
      const mixedRoot = popup(), mixedGroups = [...mixedRoot.querySelectorAll('.query-source')];
      const failedOnline = mixedGroups.find(group => group.dataset.sourceId === onlineSource.id);
      require(['查询失败', '服务冷却中'].includes(failedOnline?.querySelector('.source-status').textContent) && !failedOnline.querySelector('.source-diagnostic').hidden,
        '429 online failure diagnostic was hidden: ' + JSON.stringify({ status: failedOnline?.querySelector('.source-status')?.textContent, hidden: failedOnline?.querySelector('.source-diagnostic')?.hidden, text: failedOnline?.querySelector('.source-diagnostic')?.textContent }));
      require(mixedGroups.filter(group => group !== failedOnline).every(group => group.querySelector('.source-status').textContent === '已完成' && group.querySelector('.source-diagnostic').hidden), 'Mixed query exposed a successful local source diagnostic');
      const mixedDiagnostics = mixedRoot.querySelector('.query-diagnostics');
      require(!mixedDiagnostics.hidden && mixedDiagnostics.querySelector('pre').textContent.includes(onlineSource.name) && !mixedGroups.filter(group => group !== failedOnline).some(group => mixedDiagnostics.querySelector('pre').textContent.includes(group.querySelector('h3').textContent + '：')), 'Global diagnostics included a successful source or omitted the failure');
      mockStatus = 200; delayedResolve = undefined;
      const recoveredPending = app.queryReader(reader, 'research');
      for (let i = 0; i < 100 && !delayedResolve; i++) await pause(10);
      require(delayedResolve, 'Recovery mock did not start'); delayedResolve(); await recoveredPending;
      const recoveredMixed = popup();
      require([...recoveredMixed.querySelectorAll('.source-diagnostic')].every(node => node.hidden) && recoveredMixed.querySelector('.query-diagnostics').hidden, 'Successful retry kept stale mixed-query diagnostics');
      await step('diagnostic-visibility-mixed-and-recovery', { transport: 'offline mock in real Zotero', failedSource: onlineSource.name, successfulSourcesHidden: true, recovered: true });
    } finally {
      Zotero.HTTP.request = requestHTTP; Zotero.Prefs.set('localMDXClick.sources', JSON.stringify(savedSources)); Zotero.Prefs.set('localMDXClick.selectedSource', savedSelected);
    }
    Zotero.Prefs.set('localMDXClick.queryMode', 'all'); await app.queryReader(reader, 'research');
    const orderedIDs = [...popup().querySelectorAll('.query-source')].map(node => node.dataset.sourceId);
    require(JSON.stringify(orderedIDs) === JSON.stringify(app.getSources().filter(source => source.enabled).map(source => source.id)), 'Combined source order changed');
    await step('fixed-source-order', { ids: orderedIDs });
    const localHost = popup().host, localHeader = popup().querySelector('header'), localBefore = localHost.getBoundingClientRect();
    pointer(localHeader, 'pointerdown', localBefore.left + 180, localBefore.top + 12, 91);
    pointer(pdfWin, 'pointermove', localBefore.left + 205, localBefore.top + 12, 91); pointer(pdfWin, 'pointerup', localBefore.left + 205, localBefore.top + 12, 91);
    const localPosition = { left: localHost.style.left, top: localHost.style.top };
    require(Math.abs(parseFloat(localPosition.left) - localBefore.left) > 5, 'Local native popup did not drag');
    let localLink;
    for (let i = 0; i < 100 && !localLink; i++) {
      localLink = [...popup().querySelectorAll('iframe')].map(frame => frame.contentDocument?.querySelector('[data-mdx-entry]')).find(Boolean);
      if (!localLink) await pause(20);
    }
    require(localLink, 'Local native entry missing after drag'); localLink.click();
    for (let i = 0; i < 100 && !popup()?.querySelector('.card')?.getAttribute('aria-label').includes('network'); i++) await pause(20);
    require(popup()?.querySelector('.card')?.getAttribute('aria-label').includes('network'), 'Dragged local entry link failed');
    require(popup().host.style.left === localPosition.left && popup().host.style.top === localPosition.top, 'Internal entry reset dragged position');
    require(popup().querySelectorAll('.query-source').length === 1, 'Internal link queried additional sources');
    pdfWin.dispatchEvent(new pdfWin.Event('resize'));
    require(popup().host.style.left === localPosition.left, 'Resize reset manual position');
    require(JSON.stringify(orderedIDs) === JSON.stringify(app.getSources().filter(source => source.enabled).map(source => source.id)), 'Internal entry changed global source order');
    await step('local-drag-entry-resize', { originalIframeLink: true, positionPreserved: true, originalDictionaryOnly: true, globalOrderPreserved: true });
    const star = app.getDictionaries().find(dictionary => dictionary.format === 'StarDict'), dslDictionary = app.getDictionaries().find(dictionary => dictionary.format === 'DSL');
    Zotero.Prefs.set('localMDXClick.queryMode', 'single'); await app.selectDictionary(star.path); await app.queryReader(reader, 'studies');
    require(popup()?.querySelector('.body').textContent.includes('study'), 'Compressed StarDict synonym query failed');
    await app.selectDictionary(dslDictionary.path); await app.queryReader(reader, 'research');
    for (let i = 0; i < 100 && !popup()?.querySelector('iframe')?.contentDocument?.querySelector('[data-mdx-entry]'); i++) await pause(50);
    const dslFrame = popup()?.querySelector('iframe')?.contentDocument; require(dslFrame?.querySelector('[data-mdx-audio]'), 'DSL sound link not rendered');
    action(popup(), '发音').click();
    for (let i = 0; i < 100 && action(popup(), '重播').disabled; i++) await pause(50);
    require(!action(popup(), '重播').disabled, 'DSL external audio failed: ' + popup()?.querySelector('.source').textContent);
    dslFrame.querySelector('[data-mdx-entry]').click();
    for (let i = 0; i < 100 && !popup()?.querySelector('.card')?.getAttribute('aria-label').includes('network'); i++) await pause(50);
    require(popup()?.querySelector('.card').getAttribute('aria-label').includes('network'), 'DSL internal reference failed');
    await step('new-format-resources-and-links', { starDictSynonym: true, dslReference: true, dslAudio: true });
    Zotero.Prefs.set('localMDXClick.queryMode', 'single');
    reader.close(); await pause(500); reader = await Zotero.Reader.open(item.id); await reader._initPromise;
    reader.displayError = error => { report.hostError = String(error); void save(); };
    const annotations = reader._internalReader._state.annotations;
    require(annotations.some(annotation => annotation.type === 'highlight' && annotation.color === '#ff6666' && annotation.text === 'research'), 'Highlight missing after reopening');
    require(annotations.some(annotation => annotation.type === 'underline' && annotation.color === '#2ea8e5' && annotation.text === 'research'), 'Underline missing after reopening');
    await step('reopened-reader', { annotations: annotations.length });
    view = reader._internalReader._primaryView;
    for (let i = 0; i < 150 && (!view._iframeWindow || !view._pdfPages?.[0]?.chars?.length); i++) await pause(50);
    require(view._iframeWindow && view._pdfPages?.[0]?.chars?.length, 'Reopened PDF view not ready');
    pdfWin = view._iframeWindow.wrappedJSObject || view._iframeWindow;
    app.scanReaders();
    reader._internalReader._annotationManager._readOnly = true;
    const readonly = await menu(); require([...readonly.querySelectorAll('.annotation-actions button')].every(button => button.disabled), 'Read-only annotation actions enabled');
    reader._internalReader._annotationManager._readOnly = false;
    await step('readonly-controls', { disabled: true });
    readonly.querySelector('header button').click();
    reader._internalReader._updateState(Cu.cloneInto({ splitType: 'vertical' }, reader._iframeWindow));
    let secondary, secondaryWin;
    for (let i = 0; i < 150; i++) {
      secondary = reader._internalReader._secondaryView;
      if (secondary?._iframeWindow && secondary?._pdfPages?.[0]?.chars?.length) break;
      await pause(50);
    }
    require(secondary?._iframeWindow && secondary?._pdfPages?.[0]?.chars?.length, 'Split view not ready');
    secondaryWin = secondary._iframeWindow.wrappedJSObject || secondary._iframeWindow;
    app.scanReaders(); secondary._setSelectionRanges(Cu.cloneInto(ranges, reader._iframeWindow));
    const secondaryPopup = () => secondaryWin.document.querySelector('[data-local-mdx-popup]')?.shadowRoot;
    for (let i = 0; i < 100 && !secondaryPopup()?.querySelector('.annotation-actions button'); i++) await pause(50);
    require(secondaryPopup()?.querySelectorAll('.annotation-actions button').length === 2, 'Split view missing annotation controls');
    await step('split-view-controls', { available: true });
    secondaryPopup().querySelector('header button').click();
    Zotero.Prefs.set('localMDXClick.selectionMenu', 'native'); choose(); await pause(100);
    secondary._setSelectionRanges(Cu.cloneInto(ranges, reader._iframeWindow));
    require(reader._internalReader._state.primaryViewSelectionPopup?.annotation && reader._internalReader._state.secondaryViewSelectionPopup?.annotation, 'Native selection menu not restored');
    require(!popup(), 'Plugin popup conflicts with native menu');
    await step('native-menu', { restored: true });
    Zotero.Prefs.set('localMDXClick.selectionMenu', 'integrated'); await menu();
    const detached = await Zotero.Reader.open(item.id, null, { openInWindow: true, allowDuplicate: true });
    await detached._initPromise;
    for (let i = 0; i < 150 && !detached._internalReader?._primaryView?._pdfPages?.[0]?.chars?.length; i++) await pause(50);
    app.scanReaders(); await app.queryReader(detached, 'research');
    const detachedView = detached._internalReader._primaryView;
    const detachedWin = detachedView._iframeWindow.wrappedJSObject || detachedView._iframeWindow;
    const detachedHost = detachedWin.document.querySelector('[data-local-mdx-popup]');
    require(detachedHost?.shadowRoot.querySelector('.result-section'), 'Detached reader query failed');
    await step('detached-reader', { query: true, ownIframe: detachedWin !== pdfWin });
    if (config.liveEdgeProbe) {
      const edge = app.getSources().find(source => source.kind === 'online' && source.engineId === 'bing');
      require(edge?.id === 'online:bing', 'Default Microsoft source identity missing');
      require(edge.enabled === false, 'Microsoft source must default to disabled');
      const edgeHTTP = Zotero.HTTP.request, requests = [], copied = [];
      const copyText = Zotero.Utilities.Internal.copyTextToClipboard;
      Zotero.HTTP.request = function(method, url, options = {}) {
        if (url.startsWith('https://edge.microsoft.com/translate/translatetext?')) requests.push({ method, url, body: options.body, anon: options.anon === true, headers: options.headers || {} });
        return edgeHTTP.call(this, method, url, options);
      };
      const disabledSources = app.getSources().map(source => ({ ...source, enabled: false }));
      Zotero.Prefs.set('localMDXClick.sources', JSON.stringify(disabledSources));
      await app.queryReader(reader, 'disabled request check');
      require(requests.length === 0, 'Disabled Microsoft source made a request');
      const sources = app.getSources().map(source => ({ ...source, enabled: source.engineId === 'bing' }));
      Zotero.Prefs.set('localMDXClick.sources', JSON.stringify(sources));
      Zotero.Prefs.set('localMDXClick.selectedSource', edge.id); Zotero.Prefs.set('localMDXClick.queryMode', 'single');
      Zotero.Utilities.Internal.copyTextToClipboard = function(text) { copied.push(text); return copyText.call(this, text); };
      const examples = [];
      try {
        for (const text of ['hello', 'Hello, world!']) {
          await app.queryReader(reader, text);
          const root = popup(), group = root?.querySelector('.query-source[data-source-id="online:bing"]');
          require(group?.querySelector('.source-status')?.textContent === '已完成', 'Microsoft translation did not complete: ' + group?.querySelector('.source-diagnostic')?.textContent);
          const translated = group.querySelectorAll('p')[1]?.textContent;
          require(translated && translated.length <= 32768, 'Microsoft translation text is missing or unbounded');
          require(!group.querySelector('iframe') && action(root, '收藏')?.disabled, 'Online result exposed a local-only action');
          const copy = [...group.querySelectorAll('button')].find(button => button.textContent === '复制');
          require(copy, 'Microsoft result did not expose copy'); copy.click();
          require(copied.at(-1) === translated && group.querySelector('.source-footer').textContent === '已复制翻译',
            'Microsoft text could not be copied: ' + JSON.stringify({ translated, copied: copied.at(-1), footer: group.querySelector('.source-footer').textContent }));
          examples.push({ query: text, translation: translated, targetLanguage: 'zh-Hans', copied: true });
          await step('microsoft-edge-example', examples.at(-1));
        }
        require(requests.length === 2 && requests.every(request => request.method === 'POST' && request.anon && !request.url.includes('from=') && !Object.keys(request.headers).some(key => /^(authorization|cookie|user-agent)$/i.test(key))), 'Unexpected Microsoft request count, credentials, User-Agent override or source-language parameter');
        require(JSON.stringify(requests.map(request => JSON.parse(request.body))) === JSON.stringify([['hello'], ['Hello, world!']]), 'Microsoft request bodies differ from bounded examples');
        await step('microsoft-edge-zotero-e2e', { transport: 'real Zotero HTTP, live Microsoft requests', disabledRequestCount: 0, requestCount: requests.length, requests, examples });
      } finally {
        Zotero.HTTP.request = edgeHTTP; Zotero.Utilities.Internal.copyTextToClipboard = copyText;
      }
    } else await step('microsoft-edge-zotero-e2e', { skipped: true, reason: 'Explicit --network required; sends at most two live requests (one word and one short sentence).' });
    if (config.livePublicOnlineProbes) {
      const providers = [
        { engineId: 'youdao', id: 'online:youdao', recipient: '有道', endpoint: 'https://aidemo.youdao.com/trans', method: 'POST', target: 'zh-CHS' },
        { engineId: 'mymemory', id: 'online:mymemory', recipient: 'MyMemory', endpoint: 'https://api.mymemory.translated.net/get', method: 'GET', target: 'zh-CN' },
      ];
      const originalHTTP = Zotero.HTTP.request, originalCopy = Zotero.Utilities.Internal.copyTextToClipboard;
      const originalSources = app.getSources(), originalSelectedSource = Zotero.Prefs.get('localMDXClick.selectedSource');
      const requests = [], copied = [], examples = [];
      Zotero.HTTP.request = function(method, url, options = {}) {
        const endpoint = url.split('?', 1)[0], provider = providers.find(item => endpoint === item.endpoint);
        if (provider) {
          const entry = { provider: provider.engineId, method, endpoint, anonymous: options.anon === true };
          if (provider.engineId === 'youdao') {
            const form = new URLSearchParams(options.body || '');
            entry.contentType = options.headers?.['Content-Type'] || '';
            entry.parametersVerified = method === 'POST' && entry.contentType === 'application/x-www-form-urlencoded' && form.get('from') === 'auto' && form.get('to') === 'zh-CHS' && form.get('q') === config.publicQuery && [...form.keys()].sort().join(',') === 'from,q,to';
          } else {
            const parsed = new URL(url);
            entry.parametersVerified = method === 'GET' && parsed.searchParams.get('q') === config.publicQuery && parsed.searchParams.get('langpair') === 'en|zh-CN' && [...parsed.searchParams.keys()].sort().join(',') === 'langpair,q';
          }
          requests.push(entry);
          return Promise.resolve(originalHTTP.call(Zotero.HTTP, method, url, options)).then(xhr => {
            entry.httpStatus = Number.isInteger(xhr?.status) ? xhr.status : null;
            try {
              const data = JSON.parse(xhr?.responseText || 'null');
              if (provider.engineId === 'youdao') {
                entry.businessStatus = data?.errorCode == null ? null : String(data.errorCode).slice(0, 24);
                entry.businessOk = entry.businessStatus === '0' && Array.isArray(data?.translation) && data.translation.length > 0;
              } else {
                entry.businessStatus = Number.isInteger(data?.responseStatus) ? data.responseStatus : null;
                entry.quotaFinished = data?.quotaFinished === true;
                entry.businessOk = entry.businessStatus === 200 && !entry.quotaFinished && typeof data?.responseData?.translatedText === 'string';
              }
            } catch (_) { entry.businessOk = false; }
            return xhr;
          }, error => {
            const xhr = error?.xmlhttp;
            entry.httpStatus = Number.isInteger(error?.status) ? error.status : Number.isInteger(xhr?.status) ? xhr.status : null;
            entry.contentType = (() => { try { return xhr?.getResponseHeader?.('Content-Type') || null; } catch (_) { return null; } })();
            entry.businessOk = false;
            throw error;
          });
        }
        return originalHTTP.call(Zotero.HTTP, method, url, options);
      };
      Zotero.Utilities.Internal.copyTextToClipboard = function(text) { copied.push(text); return originalCopy.call(this, text); };
      try {
        require(providers.every(provider => app.getSources().some(source => source.id === provider.id && source.engineId === provider.engineId && source.enabled === false)), 'Public translation sources are not independently disabled by default');
        Zotero.Prefs.set('localMDXClick.sources', JSON.stringify(originalSources.map(source => ({ ...source, enabled: false }))));
        Zotero.Prefs.set('localMDXClick.queryMode', 'single');
        await app.queryReader(reader, 'disabled public-provider check');
        require(requests.length === 0, 'Disabled new providers made a request');
        for (const provider of providers) {
          const configured = originalSources.map(source => ({ ...source, enabled: source.id === provider.id }));
          Zotero.Prefs.set('localMDXClick.sources', JSON.stringify(configured));
          Zotero.Prefs.set('localMDXClick.selectedSource', provider.id);
          const before = requests.length;
          await app.queryReader(reader, config.publicQuery);
          const root = popup(), group = root?.querySelector('.query-source[data-source-id="' + provider.id + '"]');
          require(group?.querySelector('.source-status')?.textContent === '已完成', provider.recipient + ' real Zotero request failed: ' + group?.querySelector('.source-diagnostic')?.textContent);
          require(group?.querySelector('.source-diagnostic').hidden && root.querySelector('.query-diagnostics').hidden, provider.recipient + ' success exposed diagnostics');
          const translated = group.querySelectorAll('p')[1]?.textContent;
          require(typeof translated === 'string' && translated.trim() && translated.length <= 32768, provider.recipient + ' returned no bounded translation');
          const copy = [...group.querySelectorAll('button')].find(button => button.textContent === '复制');
          require(copy, provider.recipient + ' result did not expose copy'); copy.click();
          require(copied.at(-1) === translated && group.querySelector('.source-footer').textContent === '已复制翻译', provider.recipient + ' result could not be copied');
          require(requests.length === before + 1, provider.recipient + ' request count exceeded one');
          const observed = requests.at(-1);
          require(observed.provider === provider.engineId && observed.method === provider.method && observed.endpoint === provider.endpoint && observed.anonymous && observed.parametersVerified,
            provider.recipient + ' request did not match the required provider contract: ' + JSON.stringify(observed));
          require(group.dataset.sourceId === provider.id && app.getSources().find(source => source.id === provider.id)?.engineId === provider.engineId,
            provider.recipient + ' source attribution or engineId mismatch');
          require(requests.at(-1).httpStatus >= 200 && requests.at(-1).httpStatus < 300 && requests.at(-1).businessOk,
            provider.recipient + ' HTTP or business response was not successful: ' + JSON.stringify(requests.at(-1)));
          examples.push({ provider: provider.engineId, engineId: provider.engineId, sourceId: provider.id, query: config.publicQuery, translation: translated, targetLanguage: provider.target, httpStatus: requests.at(-1).httpStatus, businessStatus: requests.at(-1).businessStatus, businessOk: requests.at(-1).businessOk, copied: true, diagnosticsHidden: true, requestCount: 1 });
          await step('public-translator-zotero-example', examples.at(-1));
        }
        require(requests.length === 2, 'Public providers did not each receive exactly one request');
        await step('public-translators-zotero-e2e', { transport: 'real Zotero HTTP', probes: requests, disabledRequestCount: 0, examples, package: config.testPackage || null });
      } finally {
        Zotero.HTTP.request = originalHTTP; Zotero.Utilities.Internal.copyTextToClipboard = originalCopy;
        Zotero.Prefs.set('localMDXClick.sources', JSON.stringify(originalSources));
        if (originalSelectedSource) Zotero.Prefs.set('localMDXClick.selectedSource', originalSelectedSource);
      }
    } else await step('public-translators-zotero-e2e', { skipped: true, reason: 'Explicit --public-online-probes required; max one real request per new provider.' });
    if (config.liveGoogleDiagnostic) {
      const google = app.getSources().find(source => source.id === 'online:google' && source.engineId === 'google');
      require(google, 'Google source is missing');
      const googleHTTP = Zotero.HTTP.request, originalSources = app.getSources();
      const originalCopy = Zotero.Utilities.Internal.copyTextToClipboard, requests = [], copied = [];
      Zotero.HTTP.request = function(method, url, options = {}) {
        if (!url.startsWith('https://translate.googleapis.com/translate_a/single?')) return googleHTTP.call(this, method, url, options);
        const parsedURL = new URL(url);
        const record = { method, endpoint: 'https://translate.googleapis.com/translate_a/single', anonymous: options.anon === true,
          parametersVerified: method === 'GET' && parsedURL.searchParams.get('client') === 'gtx' && parsedURL.searchParams.get('sl') === 'auto' && parsedURL.searchParams.get('tl') === 'zh-CN' && parsedURL.searchParams.get('dt') === 't' && parsedURL.searchParams.get('q') === config.googleQuery };
        requests.push(record);
        return Promise.resolve(googleHTTP.call(this, method, url, options)).then(xhr => {
          record.httpStatus = Number.isInteger(xhr?.status) ? xhr.status : null;
          record.contentType = (() => { try { return xhr?.getResponseHeader?.('Content-Type') || null; } catch (_) { return null; } })();
          const body = typeof xhr?.responseText === 'string' ? xhr.responseText : '';
          record.responseClass = /sorry|unusual traffic|denied/i.test(body) ? 'service-rejection-html' : record.httpStatus >= 200 && record.httpStatus < 300 ? 'http-success' : 'http-error';
          record.validTranslationResponse = false;
          if (record.responseClass === 'http-success') {
            try {
              const data = JSON.parse(body), segments = data?.[0];
              record.validTranslationResponse = Array.isArray(segments) && segments.length > 0 && segments.every(segment => Array.isArray(segment) && typeof segment[0] === 'string') && segments.map(segment => segment[0]).join('').trim().length > 0;
              record.translationSegments = record.validTranslationResponse ? segments.length : 0;
            } catch (_) {}
          }
          return xhr;
        }, error => {
          const xhr = error?.xmlhttp;
          record.httpStatus = Number.isInteger(error?.status) ? error.status : Number.isInteger(xhr?.status) ? xhr.status : null;
          record.contentType = (() => { try { return xhr?.getResponseHeader?.('Content-Type') || null; } catch (_) { return null; } })();
          let body = '';
          try { body = typeof xhr?.responseText === 'string' ? xhr.responseText : ''; } catch (_) {}
          record.responseClass = /sorry|unusual traffic|denied/i.test(body) ? 'service-rejection-html' : Number.isInteger(record.httpStatus) ? 'http-error' : 'transport-error';
          record.validTranslationResponse = false;
          throw error;
        });
      };
      Zotero.Utilities.Internal.copyTextToClipboard = function(text) { copied.push(text); return originalCopy.call(this, text); };
      try {
        Zotero.Prefs.set('localMDXClick.sources', JSON.stringify(originalSources.map(source => ({ ...source, enabled: source.id === google.id }))));
        Zotero.Prefs.set('localMDXClick.selectedSource', google.id); Zotero.Prefs.set('localMDXClick.queryMode', 'single');
        await app.queryReader(reader, config.googleQuery);
        const root = popup(), group = root?.querySelector('.query-source[data-source-id="online:google"]');
        require(requests.length === 1, 'Google diagnostic must send exactly one real request');
        const record = requests[0];
        record.engineId = google.engineId;
        record.sourceId = group?.dataset.sourceId || null;
        record.cooldownUi = group?.querySelector('.source-status')?.textContent === '服务冷却中';
        record.sourceStatus = group?.querySelector('.source-status')?.textContent || null;
        record.diagnosticsVisible = group ? !group.querySelector('.source-diagnostic')?.hidden : null;
        record.translation = group?.querySelectorAll('p')[1]?.textContent?.trim() || null;
        record.translationDisplayed = record.validTranslationResponse && !!record.translation;
        record.copyMatchesTranslation = false;
        if (record.translationDisplayed) {
          const copy = [...group.querySelectorAll('button')].find(button => button.textContent === '复制');
          if (copy) { copy.click(); record.copyMatchesTranslation = copied.at(-1) === record.translation && group.querySelector('.source-footer')?.textContent === '已复制翻译'; }
        }
        record.successDiagnosticsHidden = !!record.translationDisplayed && group?.querySelector('.source-diagnostic')?.hidden === true && root?.querySelector('.query-diagnostics')?.hidden === true;
        record.recovered = !!record.translationDisplayed && record.engineId === 'google' && record.sourceId === google.id && record.parametersVerified && record.copyMatchesTranslation && record.successDiagnosticsHidden;
        await step('google-real-network-diagnostic', { probeCount: requests.length, request: record, recovered: record.recovered, query: config.googleQuery });
      } finally {
        Zotero.HTTP.request = googleHTTP;
        Zotero.Utilities.Internal.copyTextToClipboard = originalCopy;
        Zotero.Prefs.set('localMDXClick.sources', JSON.stringify(originalSources));
        Zotero.Prefs.set('localMDXClick.queryMode', 'all');
      }
    } else await step('google-real-network-diagnostic', { skipped: true, reason: 'Explicit --google-diagnostic required; sends at most one real request after an environment/configuration change.' });
    app.stop(); choose(); secondary._setSelectionRanges(Cu.cloneInto(ranges, reader._iframeWindow));
    require(!detachedWin.document.querySelector('[data-local-mdx-popup]'), 'Detached popup survived stop');
    detached.close();
    require(!popup() && !secondaryPopup() && reader._internalReader._state.primaryViewSelectionPopup?.annotation && reader._internalReader._state.secondaryViewSelectionPopup?.annotation, 'Plugin cleanup did not restore native callback');
    await step('plugin-cleanup', { restored: true });
    report.ok = true;
  } catch (error) { report.error = String(error); report.stack = error.stack; }
  delete Zotero.__localQueryTrace;
  deadline.cancel(); for (const timer of timers) timer.cancel(); await save(); Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
}
