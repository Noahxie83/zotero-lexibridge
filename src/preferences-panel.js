/* SPDX-License-Identifier: GPL-3.0-or-later */
import { element } from './render.js';
export function mountEnhancements(win, { get, set, vocabulary, onExport, onBackup, onImport, onResourceOrder, dictionaries, onOrder, onFolders, onRemoveFolder, folders, onRefresh }) {
  const doc = win.document, host = doc.getElementById('local-mdx-enhancements'); if (!host) return () => {};
  host.replaceChildren();
  const status = element(doc, 'p'); status.setAttribute('role', 'status');
  const fields = new Map();
  const run = action => async () => { try { await action(); status.textContent = '操作完成。'; refresh(); } catch (error) { status.textContent = error.message; } };
  const button = (parent, label, action) => { const node = element(doc, 'button', label); node.type = 'button'; node.addEventListener('click', run(action)); parent.append(node); return node; };
  const heading = label => host.append(element(doc, 'h3', label));
  const select = (label, key, options) => {
    const row = element(doc, 'label', label + '：'), input = element(doc, 'select');
    for (const [value, text] of options) { const option = element(doc, 'option', text); option.value = value; input.append(option); }
    input.dataset.setting = key; input.value = String(get(key) ?? options[0][0]); fields.set(key, { input, fallback: options[0][0] }); input.addEventListener('change', () => set(key, key === 'recursive' ? input.value === 'true' : input.value)); row.append(input); host.append(row);
  };
  const number = (label, key, fallback, min, max) => {
    const row = element(doc, 'label', label + '：'), input = element(doc, 'input'); input.type = 'number'; input.min = min; input.max = max; input.value = get(key) || fallback; input.style.width = '85px';
    input.dataset.setting = key; fields.set(key, { input, fallback }); input.addEventListener('change', () => { const value = Number(input.value); if (!Number.isFinite(value)) return; input.value = Math.round(Math.max(min, Math.min(max, value))); set(key, Number(input.value)); }); row.append(input); host.append(row);
  };
  heading('阅读外观与发音');
  select('主题', 'theme', [['original', '保持词典原样'], ['light', '浅色'], ['dark', '深色阅读']]);
  number('字号', 'fontSize', 16, 12, 28); number('弹窗宽度', 'popupWidth', 540, 320, 1000); number('弹窗最大高度', 'popupHeight', 580, 240, 1000);
  select('发音按钮优先使用', 'pronunciation', [['first', '词典首个发音'], ['uk', '英式（无法识别时用首个）'], ['us', '美式（无法识别时用首个）']]);
  select('扫描子目录', 'recursive', [['false', '只扫描当前层'], ['true', '递归扫描（最多 8 层）']]);
  heading('当前词典的手动 MDD 顺序'); const resources = element(doc, 'div'); host.append(resources);
  heading('词典查询顺序'); const dictionaryList = element(doc, 'div'); host.append(dictionaryList);
  heading('词典目录'); const folderList = element(doc, 'div'); host.append(folderList);
  button(host, '添加词典目录…', onFolders); button(host, '刷新全部目录', onRefresh);
  heading('生词记录'); const records = element(doc, 'div'); host.append(records);
  const exports = element(doc, 'p'); button(exports, '导出 CSV…', () => onExport('csv')); button(exports, '导出 Anki TSV…', () => onExport('anki')); host.append(exports);
  heading('设置迁移'); button(host, '备份设置与生词…', onBackup); button(host, '导入备份…', onImport);
  host.append(element(doc, 'p', '查询快捷键：Ctrl/⌘+Alt+D。生词只在点击收藏或写入笔记时保存。Anki TSV 导入时选择制表符分隔，并关闭 HTML 字段解释。备份包含本地路径与生词上下文。'), status);
  let signature = '', offset = 0;
  const refresh = () => {
    for (const [key, { input, fallback }] of fields) if (doc.activeElement !== input) input.value = String(get(key) ?? fallback);
    const dicts = dictionaries(), directories = folders(), config = get('resources') || '{}';
    let rows;
    try { rows = vocabulary.list(); } catch (error) { status.textContent = error.message; rows = []; }
    const next = JSON.stringify([dicts, directories, config, get('path'), rows, offset]); if (next === signature) return; signature = next;
    resources.replaceChildren();
    let options = {}; try { options = JSON.parse(config)[get('path')] || {}; } catch { status.textContent = '资源设置格式错误。'; }
    for (const [index, path] of (options.extraArchives || []).entries()) {
      const row = element(doc, 'p', path.split(/[\\/]/).pop() + ' ');
      button(row, '↑', () => onResourceOrder(index, -1)); button(row, '↓', () => onResourceOrder(index, 1)); button(row, '移除', () => onResourceOrder(index, 0)); resources.append(row);
    }
    if (!resources.childNodes.length) resources.append(element(doc, 'p', '未手动添加 MDD。自动关联的分卷按编号排序。'));
    dictionaryList.replaceChildren();
    dicts.forEach((dictionary, index) => { const row = element(doc, 'p', dictionary.name + ' '); button(row, '↑', () => onOrder(index, -1)); button(row, '↓', () => onOrder(index, 1)); dictionaryList.append(row); });
    folderList.replaceChildren();
    directories.forEach(path => { const row = element(doc, 'p', path + ' '); row.style.overflowWrap = 'anywhere'; button(row, '从列表移除', () => onRemoveFolder(path)); folderList.append(row); });
    records.replaceChildren(); offset = Math.max(0, Math.min(offset, Math.max(0, Math.ceil(rows.length / 20) - 1) * 20));
    records.append(element(doc, 'p', `共 ${rows.length} 条；显示 ${rows.length ? offset + 1 : 0}–${Math.min(offset + 20, rows.length)} 条`));
    for (const record of rows.slice(offset, offset + 20)) {
      const row = element(doc, 'p', record.word + ' · ' + (record.context?.title || '手动查询') + (record.context?.pageIndex == null ? '' : ` · 第 ${record.context.pageIndex + 1} 页`) + ' ');
      row.title = record.definition + '\n' + (record.context?.sentence || '');
      if (record.context?.sourceURL?.startsWith('zotero://open-pdf/')) { const link = element(doc, 'a', '原文'); link.href = record.context.sourceURL; row.append(link); }
      button(row, '删除记录', () => vocabulary.remove(record.id)); records.append(row);
    }
    const previous = button(records, '上一页', () => { offset -= 20; signature = ''; }); previous.disabled = offset === 0;
    const nextPage = button(records, '下一页', () => { offset += 20; signature = ''; }); nextPage.disabled = offset + 20 >= rows.length;
  };
  refresh(); return refresh;
}
