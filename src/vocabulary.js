/* SPDX-License-Identifier: GPL-3.0-or-later */
import { parseFragment } from 'parse5';
export function plainDefinition(html, limit = 4000) {
  const stack = [...parseFragment(String(html).slice(0, 4_000_000)).childNodes].reverse(); let text = '';
  while (stack.length && text.length < limit) {
    const node = stack.pop(); if (['script', 'style', 'template'].includes(node.tagName)) continue;
    if (node.nodeName === '#text') text += node.value + ' ';
    else stack.push(...(node.childNodes || []).slice().reverse());
  }
  return text.replace(/\s+/g, ' ').trim().slice(0, limit);
}
export class VocabularyStore {
  constructor({ read, write, limit = 1000 }) { this.read = read; this.write = write; this.limit = limit; }
  list() {
    const value = JSON.parse(this.read() || '[]');
    if (!Array.isArray(value) || value.some(row => !row || typeof row.id !== 'string' || typeof row.word !== 'string' || typeof row.definition !== 'string' || !Array.isArray(row.headwords) || row.headwords.some(word => typeof word !== 'string') || !Array.isArray(row.dictionaries) || row.dictionaries.some(name => typeof name !== 'string') || (row.context != null && (typeof row.context !== 'object' || Array.isArray(row.context))))) throw new Error('生词记录格式损坏，请先备份设置。');
    return value;
  }
  save(rows) {
    const text = JSON.stringify(rows); if (text.length > 2_000_000) throw new Error('生词记录超过存储限额，请先导出或删除部分记录。');
    this.write(text);
  }
  add({ word, results, context = {} }) {
    if (!word || word.length > 256 || !results?.length) throw new Error('请先查询并获得释义，再收藏。');
    const id = JSON.stringify([context.libraryID || null, context.itemKey || '', context.pageIndex ?? -1, word.normalize('NFC').toLowerCase()]);
    const rows = this.list(), old = rows.find(row => row.id === id);
    const row = { id, word, headwords: [...new Set(results.map(result => result.headword))],
      dictionaries: [...new Set(results.map(result => result.dictionaryName))],
      definition: results.slice(0, 3).map(result => `${result.dictionaryName} · ${result.headword}: ${plainDefinition(result.html, 1200)}`).join('\n').slice(0, 4000),
      context: JSON.parse(JSON.stringify(context)), createdAt: old?.createdAt || new Date().toISOString() };
    if (!old && rows.length >= this.limit) throw new Error('生词记录已达 1000 条，请先导出或删除部分记录。');
    this.save([row, ...rows.filter(record => record.id !== id)]); return row;
  }
  remove(id) { this.save(this.list().filter(row => row.id !== id)); }
}
const spreadsheetCell = value => {
  let text = String(value ?? ''); if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
};
export function exportVocabulary(rows, format = 'csv') {
  const cells = row => [row.word, row.headwords.join(' / '), row.definition, row.context?.sentence || '', row.context?.title || '', row.context?.pageIndex == null ? '' : row.context.pageIndex + 1, row.context?.sourceURL || '', row.dictionaries.join(' / ')];
  if (format === 'anki') return rows.map(row => cells(row).map(value => String(value).replace(/[\t\r\n]/g, ' ')).join('\t')).join('\n') + '\n';
  return '\ufeff' + [['单词', '命中词', '释义', '上下文', '文献', '页码', '原文链接', '词典'], ...rows.map(cells)].map(row => row.map(spreadsheetCell).join(',')).join('\r\n') + '\r\n';
}
export const escapeHTML = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export function vocabularyNote(row) {
  const url = row.context?.sourceURL || '';
  return `<h2>${escapeHTML(row.word)}</h2><p>${escapeHTML(row.headwords.join(' / '))}</p><p>${escapeHTML(row.definition).replace(/\n/g, '<br>')}</p><blockquote>${escapeHTML(row.context?.sentence)}</blockquote><p>${escapeHTML(row.context?.title)} · 第 ${(row.context?.pageIndex ?? 0) + 1} 页</p>`
    + (url.startsWith('zotero://open-pdf/') ? `<p><a href="${escapeHTML(url)}">返回原文</a></p>` : '');
}
export async function saveVocabularyNote(Zotero, row) {
  const attachment = row.context?.itemID && Zotero.Items.get(row.context.itemID);
  if (!attachment || attachment.key !== row.context.itemKey || attachment.libraryID !== row.context.libraryID) throw new Error('找不到对应文献，请重新从阅读器查询。');
  const library = Zotero.Libraries.get(attachment.libraryID);
  if (!library?.editable || attachment.isEditable?.() === false) throw new Error('此文献库只读，不能写入笔记。');
  const note = new Zotero.Item('note'); note.libraryID = attachment.libraryID;
  // Standalone attachments cannot parent a note. Create a standalone note then.
  if (attachment.parentItemID) note.parentID = attachment.parentItemID;
  note.setNote(vocabularyNote(row)); return note.saveTx();
}
