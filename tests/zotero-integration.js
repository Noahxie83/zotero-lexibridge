// Run only by the isolated verification copy, never by the shipped addon.
async function runZoteroVerification(config) {
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
    await step('combined-query', { sources: 2 });
    const researchRoot = popup();
    for (let i = 0; i < 100 && !researchRoot.querySelector('iframe')?.contentDocument?.querySelector('[data-mdx-entry]'); i++) await pause(50);
    const frame = researchRoot.querySelector('iframe').contentDocument;
    require(frame.querySelector('[data-mdx-entry]'), 'Native dictionary frame did not mount');
    require(frame.defaultView.getComputedStyle(frame.body).fontSize === '16px', 'Unexpected default definition size');
    frame.querySelector('[data-mdx-entry]').click();
    for (let i = 0; i < 100 && !popup()?.querySelector('.card')?.getAttribute('aria-label').includes('network'); i++) await pause(50);
    require(popup()?.querySelector('.card').getAttribute('aria-label').includes('network'), 'Internal link failed');
    const action = (root, text) => [...root.querySelectorAll('button')].find(button => button.textContent === text);
    action(popup(), '返回').click();
    for (let i = 0; i < 100 && !popup()?.querySelector('.card')?.getAttribute('aria-label').includes('research'); i++) await pause(50);
    require(popup()?.querySelector('.card').getAttribute('aria-label').includes('research'), 'Back navigation failed');
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
    app.stop(); choose(); secondary._setSelectionRanges(Cu.cloneInto(ranges, reader._iframeWindow));
    require(!popup() && !secondaryPopup() && reader._internalReader._state.primaryViewSelectionPopup?.annotation && reader._internalReader._state.secondaryViewSelectionPopup?.annotation, 'Plugin cleanup did not restore native callback');
    await step('plugin-cleanup', { restored: true });
    report.ok = true;
  } catch (error) { report.error = String(error); report.stack = error.stack; }
  deadline.cancel(); for (const timer of timers) timer.cancel(); await save(); Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
}
