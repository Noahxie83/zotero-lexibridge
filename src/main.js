/* SPDX-License-Identifier: GPL-3.0-or-later */
import { DictionaryPool } from './dictionary-pool.js';
import { wordAtPoint } from './word-at-point.js';
import { queryFromText, readSelection, selectionSignature } from './selection-query.js';
import { replaceSelectionMenu, renderSelectionTools, saveSelectionAnnotation } from './selection-menu.js';
import { createCard, element } from './render.js';
import { LocalResources, MAX_RESOURCE, ResourceCancelledError } from './resources.js';
import { queryDictionaries } from './query-engine.js';
import { displayResults } from './definition-view.js';
import { QueryHistory } from './history.js';
import { queryControls } from './query-controls.js';
import { readerViews, readerContext, readerInput } from './reader-adapter.js';
import { basename, dirname } from './local-path.js';
import { ResourcePool } from './resource-pool.js';
import { VocabularyStore, exportVocabulary, saveVocabularyNote } from './vocabulary.js';
import { appearanceSettings, applyAppearance, preferredAudio } from './appearance-settings.js';
import { mountEnhancements } from './preferences-panel.js';
import { folderList, scanDirectories, orderedDictionaries } from './directory-library.js';
import { settingsBackup, validateSettings, relocateSettings } from './settings-backup.js';
import { spellingSuggestions } from './word-search.js';
import { dictionaryFormat } from './dictionary-formats.js';

export function createApp(env, pluginID) {
  const { Zotero, IOUtils, ChromeUtils, Cu } = env;
  const pref = 'localMDXClick.';
  let stopped = false, timer, dictionaryPromise, dictionaryPath, generation = 0, resourceGeneration = 0, folderEpoch = 0;
  let dictionaries = [], loadedDictionary, loadedResources, resourcesPromise;
  let status = '尚未选择词典。';
  let selectionEpoch = 0;
  const dictionaryPool = new DictionaryPool(IOUtils);
  const resourcePool = new ResourcePool(openResources);
  const extraToolbar = new Set();
  const preferencePanels = new Map();
  const vocabulary = new VocabularyStore({ read: () => Zotero.Prefs.get(pref + 'vocabulary'), write: value => Zotero.Prefs.set(pref + 'vocabulary', value) });
  const sessions = new Map(), toolbarButtons = new Set(), selectors = new Set(), preferenceWindows = new Set();
  const getPath = () => Zotero.Prefs.get(pref + 'path') || '';
  const getFolder = () => Zotero.Prefs.get(pref + 'folder') || '';
  const getFolders = () => folderList(Zotero.Prefs.get(pref + 'directories'), getFolder());
  const enabled = () => Zotero.Prefs.get(pref + 'enabled') !== false;
  const selectionEnabled = () => Zotero.Prefs.get(pref + 'selectionEnabled') !== false;
  const integratedMenu = () => Zotero.Prefs.get(pref + 'selectionMenu') !== 'native';
  const errorText = e => String(e?.message || e);
  const log = e => Zotero.logError(e);
  const getMode = () => Zotero.Prefs.get(pref + 'displayMode') === 'text' ? 'text' : 'original';
  const configurations = () => {
    try { return JSON.parse(Zotero.Prefs.get(pref + 'resources') || '{}'); } catch { return {}; }
  };
  const resourceOptions = () => configurations()[getPath()] || {};

  function fillSelect(select) {
    const signature = dictionaries.map(d => d.path).join('\n');
    if (select.dataset.list !== signature) {
      select.replaceChildren();
      for (const d of dictionaries) {
        const option = element(select.ownerDocument, 'option', d.name + ' · ' + (d.format || dictionaryFormat(d.path)));
        option.value = d.path; select.append(option);
      }
      if (!dictionaries.length) select.append(element(select.ownerDocument, 'option', '请先选择词典文件夹'));
      select.dataset.list = signature;
    }
    if (select.value !== getPath()) select.value = getPath();
    select.disabled = !dictionaries.length;
  }

  function updateUI() {
    for (const button of extraToolbar) { if (!button.isConnected) extraToolbar.delete(button); else button.disabled = !enabled(); }
    for (const button of toolbarButtons) {
      try {
        if (!button.isConnected) { toolbarButtons.delete(button); continue; }
        button.textContent = enabled() ? '本地词典 ✓' : '本地词典';
        button.setAttribute('aria-pressed', String(enabled()));
        button.title = getPath() ? '单击开关本地查词（点击 / 划选）；右键更换词典文件夹' : '选择本地词典文件夹';
      } catch { toolbarButtons.delete(button); }
    }
    for (const select of selectors) {
      try { if (!select.isConnected) selectors.delete(select); else fillSelect(select); }
      catch { selectors.delete(select); }
    }
    for (const win of preferenceWindows) {
      try {
      if (win.closed) { preferenceWindows.delete(win); continue; }
      const doc = win.document;
      const path = doc.getElementById('local-mdx-path');
      if (!path) { preferenceWindows.delete(win); continue; }
      path.textContent = getPath() || '未选择词典';
      doc.getElementById('local-mdx-folder').textContent = getFolder() || '未选择文件夹';
      fillSelect(doc.getElementById('local-mdx-select'));
      doc.getElementById('local-mdx-status').textContent = status;
      doc.getElementById('local-mdx-enabled').checked = enabled();
      doc.getElementById('local-mdx-selection-enabled').checked = selectionEnabled();
      doc.getElementById('local-mdx-selection-menu').value = integratedMenu() ? 'integrated' : 'native';
      doc.getElementById('local-mdx-selection-enabled').disabled = !integratedMenu();
      doc.getElementById('local-mdx-mode').value = getMode();
      if (doc.getElementById('local-mdx-word-forms')) doc.getElementById('local-mdx-word-forms').checked = Zotero.Prefs.get(pref + 'wordForms') !== false;
      if (doc.getElementById('local-mdx-query-mode')) doc.getElementById('local-mdx-query-mode').value = Zotero.Prefs.get(pref + 'queryMode') || 'single';
      const options = resourceOptions();
      doc.getElementById('local-mdx-resource-folder').textContent = options.folder || '使用词典同目录的资源';
      doc.getElementById('local-mdx-extra-mdd').textContent = options.extraArchives?.length ? options.extraArchives.map(basename).join('、') : '未手动添加分卷（同名 MDD 会自动关联）';
      doc.getElementById('local-mdx-resource-status').textContent = loadedResources ? `已关联 ${loadedResources.archives.length} 个 MDD 文件，按需读取其中资源。` : '查询时自动查找配套 MDD 和文件夹资源。';
      preferencePanels.get(win)?.();
      } catch { preferenceWindows.delete(win); }
    }
  }

  function loadResources(path = getPath()) { return resourcePool.load(path); }
  async function openResources(path) {
    const token = resourceGeneration;
    const guard = () => { if (stopped || token !== resourceGeneration) throw new ResourceCancelledError('词典或资源配置已变更。'); };
    const fs = {
      dirname, basename, guard,
      list: async path => { guard(); const result = await IOUtils.getChildren(path); guard(); return result; },
      stat: async path => { guard(); const result = await IOUtils.stat(path); guard(); return result; },
      source: async path => {
        guard(); const stat = await IOUtils.stat(path); guard();
        if (stat.type !== 'regular') throw new Error('资源包不是可读取的文件。');
        return { size: stat.size, read: async (offset, length) => { guard(); const result = await IOUtils.read(path, { offset, maxBytes: length }); guard(); return result; } };
      },
      readFile: async path => {
        guard(); const stat = await IOUtils.stat(path); guard();
        if (stat.type !== 'regular' || stat.size > MAX_RESOURCE) throw new Error('资源文件过大或无法读取。');
        const result = await IOUtils.read(path, { maxBytes: MAX_RESOURCE }); guard(); return result;
      },
    };
    const pending = LocalResources.open({ mdxPath: path, ...(configurations()[path] || {}), fs });
    if (path === getPath()) resourcesPromise = pending;
    try {
      const resources = await pending;
      if (stopped || token !== resourceGeneration) { resources.close(); throw new ResourceCancelledError('词典或资源配置已变更。'); }
      if (path === getPath()) loadedResources = resources;
      updateUI(); return resources;
    } catch (e) { if (resourcesPromise === pending) resourcesPromise = undefined; throw e; }
  }

  async function loadDictionary() {
    const path = getPath();
    if (!path) throw new Error('请先在“设置 → 本地词典”选择词典文件夹。');
    if (dictionaryPromise && dictionaryPath === path) return dictionaryPromise;
    dictionaryPath = path;
    const token = generation;
    status = '正在建立词目索引…'; updateUI();
    const pending = (async () => {
      const result = await dictionaryPool.load(path);
      if (!stopped && token === generation && dictionaryPath === path) {
        loadedDictionary = result;
        status = `词典已就绪（${result.count ?? result.stats?.entries ?? ''} 个词目）。`;
        updateUI();
      }
      return result;
    })();
    dictionaryPromise = pending;
    pending.catch(e => {
      if (!stopped && dictionaryPromise === pending) {
        dictionaryPromise = undefined;
        status = '读取失败：' + errorText(e); updateUI();
      }
    });
    return pending;
  }

  function dismissAll() { for (const s of sessions.values()) { try { s.close(); } catch {} } }
  function setEnabled(value) {
    Zotero.Prefs.set(pref + 'enabled', !!value);
    if (!value) dismissAll();
    for (const session of sessions.values()) session.menu?.refresh();
    updateUI();
  }

  async function selectDictionary(path, keepSession, options = {}) {
    const list = options.list || dictionaries;
    if (path && !list.some(d => d.path === path)) throw new Error('该词典不在当前文件夹列表中，请刷新词典列表。');
    const epoch = options.selectionEpoch ?? ++selectionEpoch;
    let prepared;
    try {
      if (path) { status = '正在验证词典并建立索引…'; updateUI(); prepared = await dictionaryPool.load(path, { reload: !!options.reload }); }
    } catch (error) {
      if (!stopped && epoch === selectionEpoch) { status = '切换失败，保留原词典：' + errorText(error); updateUI(); }
      throw error;
    }
    if (stopped || epoch !== selectionEpoch || (options.folderEpoch != null && options.folderEpoch !== folderEpoch)) return false;
    generation++;
    dictionaryPool.activePath = path;
    if (options.settings) for (const [key, value] of Object.entries(options.settings)) Zotero.Prefs.set(pref + key, value);
    loadedDictionary = prepared;
    invalidateResources();
    dictionaryPromise = prepared ? Promise.resolve(prepared) : undefined; dictionaryPath = path || undefined;
    if (options.list) dictionaries = options.list;
    if (options.folder != null) Zotero.Prefs.set(pref + 'folder', options.folder);
    if (options.folders) Zotero.Prefs.set(pref + 'directories', JSON.stringify(options.folders));
    Zotero.Prefs.set(pref + 'path', path || '');
    for (const s of sessions.values()) if (s !== keepSession) { try { s.close(); } catch {} }
    if (options.settings) for (const session of sessions.values()) session.menu?.refresh();
    status = path ? `词典已就绪（${prepared.stats.format} · ${prepared.count} 个词目）。` : '此文件夹未找到支持的词典。';
    updateUI();
    return true;
  }

  function invalidateResources() {
    resourceGeneration++;
    resourcePool.clear();
    loadedResources?.close(); loadedResources = undefined; resourcesPromise = undefined;
  }

  function refreshResources() {
    invalidateResources(); dismissAll(); updateUI();
  }

  async function scanFolder(folder = getFolder(), preferredPath = getPath()) {
    return scanLibrary(folder ? [folder] : [], preferredPath);
  }
  async function scanLibrary(folders = getFolders(), preferredPath = getPath()) {
    const epoch = ++folderEpoch;
    status = '正在读取词典文件夹…'; updateUI();
    try {
      if (folders.length > 32) throw new Error('最多管理 32 个词典目录。');
      const found = orderedDictionaries(await scanDirectories(IOUtils, folders, { recursive: Zotero.Prefs.get(pref + 'recursive') === true, cancelled: () => stopped || epoch !== folderEpoch }), Zotero.Prefs.get(pref + 'dictionaryOrder'));
      if (stopped || epoch !== folderEpoch) return dictionaries.slice();
      const next = found.find(d => d.path === preferredPath) || found[0];
      // Refresh invalidates an index too: the same file may have been replaced.
      await selectDictionary(next?.path || '', undefined, { list: found, folder: folders[0] || '', folders, folderEpoch: epoch, reload: true });
      return dictionaries.slice();
    } catch (e) {
      if (!stopped && epoch === folderEpoch) {
        // Nothing was committed before a complete scan. Keep the last valid
        // folder, list, selected MDX and its index when a new scan fails.
        status = '无法读取文件夹：' + errorText(e); updateUI();
      }
      throw e;
    }
  }

  async function chooseDictionary(parent) {
    const { FilePicker } = ChromeUtils.importESModule('chrome://zotero/content/modules/filePicker.mjs');
    const picker = new FilePicker();
    picker.init(parent || Zotero.getMainWindow(), '选择词典文件夹', picker.modeGetFolder);
    if (await picker.show() !== picker.returnOK || stopped) return;
    try { await scanLibrary([...new Set([...getFolders(), picker.file])]); setEnabled(true); }
    catch (e) { log(e); env.Services.prompt.alert(parent, '本地词典', errorText(e)); }
  }

  async function chooseFile(parent) {
    const { FilePicker } = ChromeUtils.importESModule('chrome://zotero/content/modules/filePicker.mjs');
    const picker = new FilePicker();
    picker.init(parent || Zotero.getMainWindow(), '选择本地词典入口文件', picker.modeOpen);
    picker.appendFilter('本地词典（MDX / StarDict / DSL）', '*.mdx; *.ifo; *.dsl; *.dsl.dz');
    if (await picker.show() !== picker.returnOK || stopped) return;
    const path = picker.file;
    if (!dictionaryFormat(path)) throw new Error('请选择 .mdx、.ifo、.dsl 或 .dsl.dz。');
    const folder = dirname(path);
    try { await scanLibrary([...new Set([...getFolders(), folder])], path); }
    catch (e) { log(e); env.Services.prompt.alert(parent, '本地词典', errorText(e)); }
  }

  async function chooseResources(parent, type) {
    if (!getPath()) { await chooseFile(parent); if (!getPath()) return; }
    const targetPath = getPath();
    const { FilePicker } = ChromeUtils.importESModule('chrome://zotero/content/modules/filePicker.mjs');
    const picker = new FilePicker();
    picker.init(parent || Zotero.getMainWindow(), type === 'folder' ? '选择当前词典的外置资源文件夹' : '选择额外 MDD 文件或分卷（可多选）', type === 'folder' ? picker.modeGetFolder : picker.modeOpenMultiple);
    if (type !== 'folder') picker.appendFilter('MDD 资源文件', '*.mdd');
    if (await picker.show() !== picker.returnOK || stopped) return;
    const config = configurations(), options = config[targetPath] || {};
    if (type === 'folder') options.folder = picker.file;
    else options.extraArchives = [...new Set([...(options.extraArchives || []), ...picker.files])];
    config[targetPath] = options;
    Zotero.Prefs.set(pref + 'resources', JSON.stringify(config));
    if (getPath() === targetPath) refreshResources();
  }

  function resetResources() {
    const config = configurations(); delete config[getPath()];
    Zotero.Prefs.set(pref + 'resources', JSON.stringify(config)); refreshResources();
  }
  async function pick(parent, title, extension, save = true) {
    const { FilePicker } = ChromeUtils.importESModule('chrome://zotero/content/modules/filePicker.mjs');
    const picker = new FilePicker(); picker.init(parent || Zotero.getMainWindow(), title, save ? picker.modeSave : picker.modeOpen);
    picker.appendFilter(extension.toUpperCase(), '*.' + extension); if (save) picker.defaultString = 'local-dictionary-' + (extension === 'json' ? 'settings' : 'vocabulary') + '.' + extension;
    const response = await picker.show(); if (response !== picker.returnOK && response !== picker.returnReplace) return null; return picker.file;
  }
  async function exportWords(parent, format) {
    const rows = vocabulary.list(); if (!rows.length) throw new Error('还没有生词记录。');
    const path = await pick(parent, '导出生词', format === 'anki' ? 'tsv' : 'csv'); if (path && !stopped) await IOUtils.writeUTF8(path, exportVocabulary(rows, format));
  }
  async function backupSettings(parent) {
    const path = await pick(parent, '备份设置与生词', 'json'); if (path && !stopped) await IOUtils.writeUTF8(path, settingsBackup(key => Zotero.Prefs.get(pref + key)));
  }
  async function importSettings(parent) {
    const path = await pick(parent, '导入 Local Dictionary 备份', 'json', false); if (!path || stopped) return;
    if ((await IOUtils.stat(path)).size > 4 * 1024 * 1024) throw new Error('备份文件超过 4 MB。');
    let settings = validateSettings(JSON.parse(await IOUtils.readUTF8(path)));
    const libraryKeys = ['path', 'folder', 'directories', 'dictionaryOrder', 'recursive'];
    if (!libraryKeys.some(key => Object.hasOwn(settings, key))) {
      for (const [key, value] of Object.entries(settings)) Zotero.Prefs.set(pref + key, value);
      for (const session of sessions.values()) session.menu?.refresh();
      refreshResources(); updateUI(); return;
    }
    settings = { ...JSON.parse(settingsBackup(key => Zotero.Prefs.get(pref + key))).settings, ...settings };
    const operation = ++selectionEpoch, scan = ++folderEpoch;
    const cancelled = () => stopped || operation !== selectionEpoch || scan !== folderEpoch;
    const replacements = [];
    for (const folder of folderList(settings.directories, settings.folder || '')) {
      if (cancelled()) return;
      let exists = false; try { exists = (await IOUtils.stat(folder)).type === 'directory'; } catch {}
      if (!exists) {
        const { FilePicker } = ChromeUtils.importESModule('chrome://zotero/content/modules/filePicker.mjs');
        const picker = new FilePicker(); picker.init(parent || Zotero.getMainWindow(), '重新定位备份中的词典目录：' + folder, picker.modeGetFolder);
        if (await picker.show() !== picker.returnOK || cancelled()) return;
        replacements.push([folder, picker.file]);
      }
    }
    settings = relocateSettings(settings, replacements);
    const folders = folderList(settings.directories, settings.folder || '');
    const list = orderedDictionaries(await scanDirectories(IOUtils, folders, { recursive: settings.recursive === true, cancelled }), settings.dictionaryOrder);
    const target = list.find(dictionary => dictionary.path === settings.path) || list[0];
    if (cancelled()) return;
    if (folders.length && !target) throw new Error('所选目录未找到支持的词典，导入已取消，保留原设置。');
    if (await selectDictionary(target?.path || '', undefined, { list, folder: folders[0] || '', folders, settings, reload: true, selectionEpoch: operation, folderEpoch: scan })) {
      dismissAll(); updateUI();
    }
  }

  function attach(view, win, internal, readerWindow, reader) {
    if (!win?.document?.body || sessions.has(win) || stopped) return;
    const doc = win.document;
    let down, card, request = 0, moved = false, selectionTimer, menu, passthroughSelection = false, returnFocus;
    const history = new QueryHistory();
    const listeners = [];
    const on = (target, name, fn, capture = false) => {
      target.addEventListener(name, fn, capture);
      listeners.push(() => target.removeEventListener(name, fn, capture));
    };
    const close = (restoreFocus = true) => {
      request++;
      try { card?.cleanup?.(); } catch {}
      try { card?.host.remove(); } catch {}
      card = undefined;
      if (restoreFocus !== false) { try { if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); } catch {} returnFocus = undefined; }
    };
    const inside = event => card && event.composedPath().includes(card.host);
    const show = async (input, x, y, annotation, options = {}) => {
      const query = typeof input === 'string' ? queryFromText(input) : input;
      if (!query) return;
      const word = query.text;
      const pinned = card?.pinned || false;
      if (!card) returnFocus = doc.activeElement;
      close(false); const ticket = request;
      card = createCard(doc, x, y, word, close);
      const current = card;
      current.pinned = pinned;
      const appearance = appearanceSettings(key => Zotero.Prefs.get(pref + key)); applyAppearance(current, appearance);
      const context = options.context || readerContext(Zotero, reader, view, annotation, options.anchor);
      if (options.record !== false && query.candidates.length) history.add({ query, annotation, preferredPath: options.preferredPath, context });
      const makeRecord = () => vocabulary.add({ word, results: current.results, context });
      queryControls(doc, current, {
        query, history,
        onQuery: text => { const next = queryFromText(text, 'manual'); if (next) void show(next, x, y, undefined, { context: readerContext(Zotero, reader, view) }).catch(log); else current.footer.textContent = '请输入最多 256 字符、16 个词的查询。'; },
        onHistory: delta => { const entry = history.move(delta); if (entry) void show(entry.query, x, y, entry.annotation, { record: false, preferredPath: entry.preferredPath, context: entry.context }).catch(log); },
        onCollect: () => { try { makeRecord(); current.collectButton.textContent = '已收藏'; current.footer.textContent = '已保存生词与文献上下文；可在设置中导出。'; } catch (error) { current.footer.textContent = errorText(error); } },
        onNote: async () => {
          current.noteButton.disabled = true;
          try { await saveVocabularyNote(Zotero, makeRecord()); current.noteButton.textContent = '已写入笔记'; current.footer.textContent = '已保存至当前文献库。'; }
          catch (error) { current.footer.textContent = errorText(error); current.noteButton.disabled = false; }
        },
        onBrowse: async prefix => {
          current.browsing = true; display?.close(); current.audioButton.disabled = true; current.replayButton.disabled = true; current.collectButton.disabled = true; current.noteButton.disabled = true; current.body.hidden = false; current.body.textContent = '正在读取词目…';
          current.setState('loading');
          try {
            const dictionary = await dictionaryPool.load(getPath()); let offset = 0;
            const renderPage = () => {
              if (ticket !== request || !current.host.isConnected) return;
              const page = dictionary.browseWords(prefix, offset, 30); current.body.replaceChildren();
              current.setState(page.words.length ? 'ready' : 'empty');
              for (const headword of page.words) {
                const button = element(doc, 'button', headword); button.type = 'button'; button.className = 'load-more';
                button.addEventListener('click', () => { void show(queryFromText(headword, 'entry'), x, y, undefined, { context }).catch(log); }); current.body.append(button);
              }
              if (!page.words.length) current.body.textContent = '没有该前缀的词目。修改输入框后再次点击“浏览词目”。';
              for (const [label, delta, disabled] of [['上一页', -30, offset === 0], ['下一页', 30, !page.more]]) {
                const button = element(doc, 'button', label); button.type = 'button'; button.className = 'load-more'; button.disabled = disabled;
                button.addEventListener('click', () => { offset += delta; renderPage(); }); current.body.append(button);
              }
              current.footer.textContent = '当前词典词目 · 前缀：' + (prefix || '全部'); current.position();
            };
            renderPage();
          } catch (error) { if (ticket === request && current.host.isConnected) { current.setState('error'); current.body.textContent = errorText(error); } }
        },
      });
      if (options.focus) current.queryInput.focus();
      if (annotation) {
        current.selectionSignature = selectionSignature(win, view);
        const snapshot = JSON.parse(JSON.stringify(annotation));
        renderSelectionTools(doc, current.selectionTools, {
          color: Zotero.Prefs.get(pref + 'annotationColor') || '#ffd400',
          setColor: color => Zotero.Prefs.set(pref + 'annotationColor', color),
          readOnly: !!internal?._annotationManager?._readOnly,
          add: (type, color) => saveSelectionAnnotation({
            view, readerWindow, Cu, annotation: snapshot, type, color,
            readOnly: !!internal?._annotationManager?._readOnly,
          }),
          onStatus: message => { if (current.host.isConnected) current.footer.textContent = message; },
        });
      }
      let display;
      current.cleanup = () => display?.close();
      fillSelect(current.selector);
      const selectedPath = getPath();
      current.selector.addEventListener('change', async () => {
        try { if (await selectDictionary(current.selector.value, sessions.get(win))) await show(query, x, y, annotation, { record: false, context }); }
        catch (error) { log(error); current.footer.textContent = '切换失败：' + errorText(error); fillSelect(current.selector); }
      });
      if (!query.candidates.length) {
        current.setState('idle');
        current.body.hidden = true;
        current.footer.textContent = annotation ? '选择颜色后点击高亮或下划线，保存至 Zotero' : '输入单词或词组后按 Enter 查询 · Ctrl/⌘+Alt+D';
        current.position(); return;
      }
      try {
        const isCurrent = () => !stopped && !current.browsing && ticket === request && getPath() === selectedPath && current.host.isConnected;
        const primaryPath = options.preferredPath || selectedPath;
        const primary = dictionaries.find(d => d.path === primaryPath) || { path: primaryPath, name: basename(primaryPath) };
        const order = [primary, ...dictionaries.filter(d => d.path !== primaryPath)];
        const mode = Zotero.Prefs.get(pref + 'queryMode') || 'single';
        const found = await queryDictionaries(query, order, {
          load: path => dictionaryPool.load(path), mode,
          forms: Zotero.Prefs.get(pref + 'wordForms') !== false, cancelled: () => !isCurrent(),
        });
        if (!isCurrent()) return;
        current.results = found.results;
        current.collectButton.disabled = !found.results.length;
        current.noteButton.disabled = !found.results.length || !context.itemID || !!internal?._annotationManager?._readOnly;
        current.queries.hidden = found.groups.length === 1 && found.groups[0].attempts.length === 1;
        current.queries.textContent = found.groups.map(group => group.name + '：' + group.attempts.map(attempt => attempt.word + (attempt.kind === 'form' ? '（词形）' : '') + (attempt.found ? ' ✓' : '（未收录）')).join(' / ')).join('；');
        current.body.replaceChildren();
        current.setState(found.results.length ? 'ready' : found.errors.length ? 'error' : 'empty');
        if (!found.results.length) current.body.textContent = found.errors.length ? '查询读取失败：' + found.errors.join('；') : '未找到“' + word + '”。可修改查询词或切换词典。';
        const diagnostics = [...found.errors, ...found.groups.flatMap(group => (group.warnings || []).map(issue => group.name + '：' + issue))];
        let resourceSources = [];
        const updateDiagnostics = (details, sources) => {
          if (!isCurrent()) return;
          if (sources) resourceSources = sources;
          for (const detail of details) if (!diagnostics.includes(detail)) diagnostics.push(detail);
          current.footer.title = diagnostics.slice(0, 100).join('\n');
          current.setDiagnostics?.(diagnostics, found.groups, resourceSources);
        };
        current.footer.textContent = found.groups.map(group => group.name).join(' / ') + ' · ' + found.results.length + ' 条释义';
        updateDiagnostics([]);
        display = displayResults({
          doc, current, results: found.results, win, original: getMode() === 'original', acquireResources: path => resourcePool.acquire(path), isCurrent,
          onEntry: (entry, path) => { void show(queryFromText(entry, 'entry'), x, y, undefined, { preferredPath: path, context }).catch(log); },
          onStatus: message => { if (isCurrent()) current.footer.textContent = message; },
          onDiagnostics: updateDiagnostics, appearance,
          onAudio: player => {
            if (!isCurrent()) return;
            if (player.keys?.length && !current.playPreferred) {
              current.audioButton.disabled = false; current.playPreferred = () => player.play(preferredAudio(player.keys, Zotero.Prefs.get(pref + 'pronunciation') || 'first'));
            }
            if (player.played) { current.replayButton.disabled = false; current.replay = () => player.play(player.played); }
          },
        });
        await display.ready;
        if (!found.results.length && !found.errors.length && isCurrent()) {
          const dictionary = await dictionaryPool.load(primaryPath);
          const suggestions = await spellingSuggestions(dictionary, word, { cancelled: () => !isCurrent(), yieldControl: () => new Promise(resolve => win.setTimeout(resolve, 0)) });
          if (isCurrent() && suggestions.length) {
            current.body.append(element(doc, 'p', '你可能想查：'));
            for (const suggestion of suggestions) {
              const button = element(doc, 'button', suggestion); button.type = 'button'; button.className = 'load-more';
              button.addEventListener('click', () => { void show(queryFromText(suggestion, 'entry'), x, y, undefined, { context, preferredPath: primaryPath }).catch(log); }); current.body.append(button);
            }
          }
        }
      } catch (e) {
        if (ticket === request && getPath() === selectedPath && current.host.isConnected) { current.setState('error'); current.body.textContent = errorText(e); }
        log(e);
      }
      if (ticket === request) current.position();
    };
    const showSelection = (selected, x, y) => {
      // Leave the native menu usable if a future reader lacks the callback.
      if (!integratedMenu() || !menu) return;
      const annotation = menu?.popup?.annotation;
      const query = selectionEnabled() && getPath() ? selected.query : null;
      if (!query && !annotation) return;
      const input = query || { text: annotation.text?.slice(0, 80) || '已选文字', candidates: [], source: 'selection' };
      if (card?.selectionSignature === selectionSignature(win, view)) return;
      void show(input, x, y, annotation).catch(log);
    };
    menu = replaceSelectionMenu(view, {
      enabled: () => enabled() && integratedMenu() && !stopped && !passthroughSelection && view._tool?.type === 'pointer',
      onError: log,
      onPopup: popup => {
        win.clearTimeout(selectionTimer);
        selectionTimer = win.setTimeout(() => {
          if (down || stopped || passthroughSelection || !enabled() || !integratedMenu() || view._tool?.type !== 'pointer') return;
          const selected = readSelection(win, view);
          if (!selected.selected) return;
          const rect = popup.rect || [30, 30, 30, 30];
          showSelection(selected, rect[2], rect[3]);
        }, 0);
      },
    });
    on(win, 'pointerdown', event => {
      down = undefined; moved = false;
      if (inside(event)) return;
      if (!card?.pinned) close();
      passthroughSelection = event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
        || !event.target.closest?.('.page')
        || !!event.target.closest?.('input,textarea,button,a,select,[contenteditable="true"],.annotationLayer,.textAnnotation');
      if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !enabled()) return;
      if (view._tool?.type && view._tool.type !== 'pointer') return;
      if (event.target.closest?.('input,textarea,button,a,select,[contenteditable="true"],.annotationLayer,.textAnnotation')) return;
      if (!event.target.closest?.('.page')) return;
      down = { x: event.clientX, y: event.clientY, id: event.pointerId, time: Date.now(), selection: selectionSignature(win, view) };
    }, true);
    on(win, 'pointermove', event => {
      if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) moved = true;
    }, true);
    on(win, 'pointerup', async event => {
      const origin = down; down = undefined;
      if (!origin || event.button !== 0 || event.pointerId !== origin.id) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !enabled()) return;
      if (view.action?.type === 'drag') return;
      const wasMoved = moved || Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 5;
      const ticket = request;
      // Zotero's native text selection may stop bubbling pointerup. Capture it,
      // then wait a task so all reader handlers finish updating the selection.
      await new Promise(resolve => win.setTimeout(resolve, 0));
      if (stopped || ticket !== request || !enabled()) return;
      const selected = readSelection(win, view);
      if (selected.selected) {
        if (wasMoved || selectionSignature(win, view) !== origin.selection) showSelection(selected, event.clientX, event.clientY);
        return;
      }
      if (!getPath() || wasMoved || Date.now() - origin.time > 650 || view._isSelectionCollapsed?.() === false) return;
      const anchor = {};
      const word = wordAtPoint(win, event.clientX, event.clientY, view, info => Object.assign(anchor, info));
      if (word) void show(word, event.clientX, event.clientY, undefined, { anchor }).catch(log);
    }, true);
    on(win, 'pointercancel', () => { down = undefined; win.clearTimeout(selectionTimer); });
    on(win, 'keydown', event => {
      if (event.key === 'Escape' && card) { close(); event.stopPropagation(); }
      else if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === 'd' && enabled()) {
        event.preventDefault(); event.stopPropagation();
        const input = readerInput(Zotero, reader, view, win);
        void show(input.query, 30, 30, undefined, { focus: true, context: input.context }).catch(log);
      }
    }, true);
    on(win, 'scroll', event => { if (!inside(event) && !card?.pinned) close(); }, true);
    on(win, 'resize', () => { if (card?.pinned) card.position(); else close(); });
    const cleanup = () => {
      close(); win.clearTimeout(selectionTimer);
      try { menu?.dispose(); } catch {}
      listeners.forEach(f => { try { f(); } catch {} }); sessions.delete(win);
    };
    on(win, 'unload', cleanup);
    sessions.set(win, { close, cleanup, show, view, menu });
  }

  function scanReaders() {
    if (stopped) return;
    for (const [win, session] of sessions) {
      try { if (win.closed) session.cleanup(); } catch { session.cleanup(); }
    }
    for (const reader of Zotero.Reader._readers || []) {
      try {
        for (const entry of readerViews(reader, Cu)) attach(entry.view, entry.win, entry.internal, entry.readerWindow, reader);
      } catch { /* A reader may be destroyed during the scan. */ }
    }
  }
  async function queryReader(reader, text = '') {
    if (!enabled()) throw new Error('本地查词已暂停。');
    scanReaders(); const views = readerViews(reader, Cu);
    const primary = (!text && views.find(entry => readSelection(entry.win, entry.view).query)) || views[0];
    const session = primary && sessions.get(primary.win); if (!session) throw new Error('阅读器尚未准备好，请重新打开 PDF。');
    const input = readerInput(Zotero, reader, primary.view, primary.win, text);
    return session.show(input.query, 30, 30, undefined, { focus: !text, context: input.context });
  }
  function toolbar(event) {
    if (event.reader.type !== 'pdf' || stopped) return;
    const button = element(event.doc, 'button');
    button.type = 'button'; button.className = 'toolbar-button';
    button.style.cssText = 'width:auto;padding:0 8px;font-size:12px;white-space:nowrap;';
    button.addEventListener('click', () => {
      if (!getPath()) void chooseDictionary(Zotero.getMainWindow()).catch(log);
      else setEnabled(!enabled());
    });
    button.addEventListener('contextmenu', e => { e.preventDefault(); void chooseDictionary(Zotero.getMainWindow()).catch(log); });
    const select = element(event.doc, 'select');
    select.setAttribute('aria-label', '选择本地词典');
    select.style.cssText = 'max-width:200px;min-width:100px;font-size:12px;';
    select.addEventListener('change', () => selectDictionary(select.value).catch(log));
    selectors.add(select);
    toolbarButtons.add(button); event.append(button, select); updateUI();
    const queryButton = element(event.doc, 'button', '查询'); queryButton.type = 'button'; queryButton.className = 'toolbar-button';
    queryButton.title = '手动输入或查询选中文字（Ctrl/⌘+Alt+D）';
    queryButton.addEventListener('click', () => {
      void queryReader(event.reader).catch(log);
    });
    extraToolbar.add(queryButton); event.append(queryButton);
    queryButton.disabled = !enabled();
    scanReaders();
  }

  return {
    async start() {
      await Zotero.PreferencePanes.register({ pluginID, id: 'local-mdx-click-preferences', label: '本地词典', src: 'content/preferences.xhtml' });
      Zotero.Reader.registerEventListener('renderToolbar', toolbar, pluginID);
      timer = env.setInterval(scanReaders, 1000);
      scanReaders();
      if (getFolders().length) await scanLibrary().catch(log);
      else if (getPath()) {
        // Preserve a configuration from an earlier single-file build.
        const path = getPath();
        await scanFolder(dirname(path)).catch(log);
      }
    },
    stop() {
      stopped = true;
      generation++; folderEpoch++; selectionEpoch++; dictionaryPool.clear();
      env.clearInterval(timer);
      Zotero.Reader.unregisterEventListener('renderToolbar', toolbar);
      for (const session of [...sessions.values()]) session.cleanup();
      for (const button of toolbarButtons) { try { button.remove(); } catch {} }
      for (const select of selectors) { try { select.remove(); } catch {} }
      for (const button of extraToolbar) { try { button.remove(); } catch {} } extraToolbar.clear();
      loadedDictionary?.clearCache(); loadedDictionary = undefined;
      invalidateResources();
      toolbarButtons.clear(); selectors.clear(); preferenceWindows.clear(); preferencePanels.clear(); dictionaryPromise = undefined;
    },
    mountPreferences(win) {
      preferenceWindows.add(win); updateUI();
      win.document.getElementById('local-mdx-choose').onclick = () => chooseDictionary(win).catch(log);
      win.document.getElementById('local-mdx-choose-file').onclick = () => chooseFile(win).catch(log);
      win.document.getElementById('local-mdx-refresh').onclick = () => scanLibrary().catch(log);
      win.document.getElementById('local-mdx-select').onchange = event => selectDictionary(event.target.value).catch(log);
      win.document.getElementById('local-mdx-enabled').onchange = event => setEnabled(event.target.checked);
      win.document.getElementById('local-mdx-selection-enabled').onchange = event => {
        Zotero.Prefs.set(pref + 'selectionEnabled', event.target.checked); dismissAll(); updateUI();
      };
      win.document.getElementById('local-mdx-selection-menu').onchange = event => {
        Zotero.Prefs.set(pref + 'selectionMenu', event.target.value); dismissAll();
        for (const session of sessions.values()) session.menu?.refresh();
        updateUI();
      };
      win.document.getElementById('local-mdx-mode').onchange = event => {
        Zotero.Prefs.set(pref + 'displayMode', event.target.value); dismissAll(); updateUI();
      };
      for (const [id, key, checkbox] of [['local-mdx-word-forms', 'wordForms', true], ['local-mdx-query-mode', 'queryMode', false]]) {
        const control = win.document.getElementById(id);
        if (control) control.onchange = event => { Zotero.Prefs.set(pref + key, checkbox ? event.target.checked : event.target.value); dismissAll(); updateUI(); };
      }
      win.document.getElementById('local-mdx-choose-resource-folder').onclick = () => chooseResources(win, 'folder').catch(log);
      win.document.getElementById('local-mdx-choose-mdd').onclick = () => chooseResources(win, 'mdd').catch(log);
      win.document.getElementById('local-mdx-reset-resources').onclick = resetResources;
      if (getPath()) loadDictionary().catch(log);
      preferencePanels.set(win, mountEnhancements(win, {
        get: key => Zotero.Prefs.get(pref + key), set: (key, value) => { Zotero.Prefs.set(pref + key, value); dismissAll(); },
        vocabulary, onExport: format => exportWords(win, format), onBackup: () => backupSettings(win), onImport: () => importSettings(win),
        dictionaries: () => dictionaries.slice(), folders: getFolders, onFolders: () => chooseDictionary(win),
        onRemoveFolder: path => scanLibrary(getFolders().filter(folder => folder !== path)), onRefresh: () => scanLibrary(),
        onOrder: (index, delta) => {
          const next = index + delta; if (next < 0 || next >= dictionaries.length) return;
          [dictionaries[index], dictionaries[next]] = [dictionaries[next], dictionaries[index]];
          Zotero.Prefs.set(pref + 'dictionaryOrder', JSON.stringify(dictionaries.map(dictionary => dictionary.path))); updateUI();
        },
        onResourceOrder: (index, delta) => {
          const config = configurations(), options = config[getPath()] || {}, archives = (options.extraArchives || []).slice();
          if (!delta) archives.splice(index, 1);
          else if (index + delta >= 0 && index + delta < archives.length) [archives[index], archives[index + delta]] = [archives[index + delta], archives[index]];
          config[getPath()] = { ...options, extraArchives: archives }; Zotero.Prefs.set(pref + 'resources', JSON.stringify(config)); refreshResources();
        },
      }));
    },
    loadDictionary, loadResources, chooseDictionary, chooseFile, chooseResources, resetResources, scanReaders, scanFolder, selectDictionary,
    vocabulary, scanLibrary, exportWords, backupSettings, importSettings, queryReader,
    getDictionaries: () => dictionaries.slice(), getPath,
  };
}
