/* SPDX-License-Identifier: GPL-3.0-or-later */
import { element } from './render.js';
import { preferencesCSS } from './preferences-appearance.js';

export function mountEnhancements(win, { get, set, vocabulary, onExport, onBackup, onImport, onResourceOrder, dictionaries, onOrder, onFolders, onRemoveFolder, folders, onRefresh }) {
  const doc = win.document, host = doc.getElementById('local-mdx-enhancements');
  if (!host) return () => {};
  const container = host.closest('.dictionary-settings') || host;
  container.classList.add('dictionary-settings');
  if (!doc.getElementById('local-dictionary-preferences-style')) {
    const style = element(doc, 'style'); style.id = 'local-dictionary-preferences-style';
    style.textContent = preferencesCSS; container.prepend(style);
  }
  host.replaceChildren();
  const status = element(doc, 'p'); status.setAttribute('role', 'status');
  const fields = new Map();
  const button = (parent, label, action) => {
    const node = element(doc, 'button', label); node.type = 'button';
    node.addEventListener('click', async () => {
      const disabled = node.disabled; node.disabled = true; status.className = ''; status.textContent = '正在处理…';
      try { await action(); status.textContent = '操作完成。'; refresh(); }
      catch (error) { status.className = 'settings-danger'; status.textContent = error.message; }
      finally { node.disabled = disabled; }
    });
    parent.append(node); return node;
  };
  const section = (label, collapsed = false) => {
    const node = element(doc, collapsed ? 'details' : 'section'); node.className = 'settings-section';
    node.append(element(doc, collapsed ? 'summary' : 'h3', label)); host.append(node); return node;
  };
  const actionRow = parent => { const row = element(doc, 'div'); row.className = 'settings-actions'; parent.append(row); return row; };
  const appearance = section('阅读外观与发音');
  const grid = element(doc, 'div'); grid.className = 'settings-grid'; appearance.append(grid);
  const field = (label, key, input, fallback, helper) => {
    const row = element(doc, 'label'); row.className = 'settings-field';
    row.append(element(doc, 'span', label), input);
    if (helper) row.append(element(doc, 'small', helper));
    input.dataset.setting = key; fields.set(key, { input, fallback }); grid.append(row);
  };
  const select = (label, key, options) => {
    const input = element(doc, 'select');
    for (const [value, text] of options) { const option = element(doc, 'option', text); option.value = value; input.append(option); }
    input.value = String(get(key) ?? options[0][0]);
    input.addEventListener('change', () => set(key, key === 'recursive' ? input.value === 'true' : input.value));
    field(label, key, input, options[0][0]);
  };
  const number = (label, key, fallback, min, max) => {
    const input = element(doc, 'input'); input.type = 'number'; input.min = min; input.max = max; input.value = get(key) || fallback;
    input.addEventListener('change', () => {
      const value = Number(input.value); if (!Number.isFinite(value)) return;
      input.value = Math.round(Math.max(min, Math.min(max, value))); set(key, Number(input.value));
    });
    field(label, key, input, fallback, `${min}-${max} px`);
  };
  select('主题', 'theme', [['original', '保持词典原样'], ['light', '浅色'], ['dark', '深色阅读']]);
  number('字号', 'fontSize', 16, 12, 28);
  number('弹窗宽度', 'popupWidth', 540, 320, 1000);
  number('弹窗最大高度', 'popupHeight', 580, 240, 1000);
  select('发音按钮优先使用', 'pronunciation', [['first', '词典首个发音'], ['uk', '英式（无法识别时用首个）'], ['us', '美式（无法识别时用首个）']]);
  select('扫描子目录', 'recursive', [['false', '只扫描当前层'], ['true', '递归扫描（最多 8 层）']]);
  const resourcesSection = section('当前词典的手动 MDD 顺序', true);
  const resources = element(doc, 'div'); resourcesSection.append(resources);
  const dictionarySection = section('词典查询顺序', true);
  const dictionaryList = element(doc, 'div'); dictionarySection.append(dictionaryList);
  const foldersSection = section('词典目录', true);
  const folderList = element(doc, 'div'); foldersSection.append(folderList);
  const folderActions = actionRow(foldersSection);
  button(folderActions, '添加词典目录…', onFolders); button(folderActions, '刷新全部目录', onRefresh);
  const vocabularySection = section('生词记录');
  const records = element(doc, 'div'); vocabularySection.append(records);
  const exports = actionRow(vocabularySection);
  button(exports, '导出 CSV…', () => onExport('csv')); button(exports, '导出 Anki TSV…', () => onExport('anki'));
  const exportHelp = element(doc, 'p', 'Anki TSV 导入时选择制表符分隔，并关闭 HTML 字段解释。'); exportHelp.className = 'settings-help'; vocabularySection.append(exportHelp);
  const migration = section('设置迁移', true), backupActions = actionRow(migration);
  button(backupActions, '备份设置与生词…', onBackup); button(backupActions, '导入备份…', onImport);
  const backupHelp = element(doc, 'p', '备份包含本地路径与生词上下文。'); backupHelp.className = 'settings-help'; migration.append(backupHelp);
  const help = element(doc, 'p', '查询快捷键：Ctrl/⌘+Alt+D。生词只在点击收藏或写入笔记时保存。'); help.className = 'settings-help';
  host.append(help, status);
  const listRow = (parent, name) => {
    const row = element(doc, 'p'); row.className = 'settings-row';
    const main = element(doc, 'span', name + ' '); main.className = 'settings-row-main';
    const actions = element(doc, 'span'); actions.className = 'settings-row-actions'; row.append(main, actions); parent.append(row);
    return { row, main, actions };
  };
  const empty = (parent, text) => { const node = element(doc, 'p', text); node.className = 'settings-empty'; parent.append(node); };
  const ordering = (actions, name, index, length, callback) => {
    for (const [label, delta, disabled] of [['↑', -1, index === 0], ['↓', 1, index === length - 1]]) {
      const node = button(actions, label, () => callback(index, delta)); node.disabled = disabled;
      node.setAttribute('aria-label', (delta < 0 ? '上移 ' : '下移 ') + name);
    }
  };
  let signature = '', offset = 0;
  const refresh = () => {
    for (const [key, { input, fallback }] of fields) if (doc.activeElement !== input) input.value = String(get(key) ?? fallback);
    const dicts = dictionaries(), directories = folders(), config = get('resources') || '{}';
    let rows;
    try { rows = vocabulary.list(); } catch (error) { status.textContent = error.message; rows = []; }
    offset = Math.max(0, Math.min(offset, Math.max(0, Math.ceil(rows.length / 20) - 1) * 20));
    const next = JSON.stringify([dicts, directories, config, get('path'), rows, offset]);
    if (next === signature) return; signature = next;
    resources.replaceChildren();
    let options = {}; try { options = JSON.parse(config)[get('path')] || {}; } catch { status.textContent = '资源设置格式错误。'; }
    const archives = options.extraArchives || [];
    for (const [index, path] of archives.entries()) {
      const name = path.split(/[\\/]/).pop(), { actions, main } = listRow(resources, name); main.title = path;
      ordering(actions, name, index, archives.length, onResourceOrder);
      button(actions, '移除', () => onResourceOrder(index, 0));
    }
    if (!archives.length) empty(resources, '未手动添加 MDD。自动关联的分卷按编号排序。');
    dictionaryList.replaceChildren();
    dicts.forEach((dictionary, index) => {
      const { main, actions } = listRow(dictionaryList, dictionary.name); main.title = dictionary.path;
      ordering(actions, dictionary.name, index, dicts.length, onOrder);
    });
    if (!dicts.length) empty(dictionaryList, '还没有词典。请先选择词典文件或文件夹。');
    folderList.replaceChildren();
    directories.forEach(path => { const { actions } = listRow(folderList, path); button(actions, '从列表移除', () => onRemoveFolder(path)); });
    if (!directories.length) empty(folderList, '还没有词典目录。添加目录后可统一刷新词典列表。');
    records.replaceChildren();
    const count = element(doc, 'p', `共 ${rows.length} 条；显示 ${rows.length ? offset + 1 : 0}-${Math.min(offset + 20, rows.length)} 条`); count.className = 'settings-count'; records.append(count);
    if (!rows.length) empty(records, '还没有生词。查到释义后点击“收藏”，即可保留单词和文献上下文。');
    for (const record of rows.slice(offset, offset + 20)) {
      const { row, main, actions } = listRow(records, ''); main.replaceChildren(element(doc, 'strong', record.word));
      main.append(element(doc, 'small', (record.context?.title || '手动查询') + (record.context?.pageIndex == null ? '' : ` · 第 ${record.context.pageIndex + 1} 页`)));
      row.title = record.definition + '\n' + (record.context?.sentence || '');
      if (record.context?.sourceURL?.startsWith('zotero://open-pdf/')) { const link = element(doc, 'a', '原文'); link.href = record.context.sourceURL; actions.append(link); }
      button(actions, '删除记录', () => vocabulary.remove(record.id)).className = 'settings-danger';
    }
    if (rows.length > 20) {
      const pagination = actionRow(records);
      const previous = button(pagination, '上一页', () => { offset -= 20; signature = ''; }); previous.disabled = offset === 0;
      const nextPage = button(pagination, '下一页', () => { offset += 20; signature = ''; }); nextPage.disabled = offset + 20 >= rows.length;
    }
  };
  refresh(); return refresh;
}
