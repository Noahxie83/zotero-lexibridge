/* SPDX-License-Identifier: GPL-3.0-or-later */
import { readSelection, queryFromText } from './selection-query.js';
export function readerInput(Zotero, reader, view, win, text = '') {
  const selected = text ? null : readSelection(win, view);
  const query = text ? queryFromText(text, 'manual') : selected.query || { text: '', candidates: [], source: 'manual' };
  const range = view?._selectionRanges?.find(range => !range.collapsed && range.anchorOffset !== range.headOffset);
  const annotation = selected?.query ? { text: selected.query.text, position: { pageIndex: range?.position?.pageIndex ?? range?.pageIndex } } : undefined;
  return { query, context: readerContext(Zotero, reader, view, annotation) };
}
// Internal reader fields are inspected here and are optional. Callers can keep
// the native selection menu and manual query when a capability is unavailable.
export function readerViews(reader, Cu) {
  if (reader?.type !== 'pdf') return [];
  const internal = reader._internalReader;
  return [internal?._primaryView, internal?._secondaryView].flatMap(view => {
    try {
      const win = view?._iframeWindow && Cu.unwaiveXrays(view._iframeWindow);
      return win?.document?.body && (win.wrappedJSObject || win).PDFViewerApplication ? [{ view, win, internal, readerWindow: reader._iframeWindow, reader }] : [];
    } catch { return []; }
  });
}
export function readerContext(Zotero, reader, view, annotation, anchor = {}) {
  const item = reader?.itemID && Zotero.Items?.get(reader.itemID);
  const library = item && Zotero.Libraries?.get(item.libraryID);
  const parent = item?.parentItemID && Zotero.Items?.get(item.parentItemID);
  const pageWindow = view?._iframeWindow?.wrappedJSObject || view?._iframeWindow;
  const pageIndex = annotation?.position?.pageIndex ?? anchor.pageIndex ?? Math.max(0, (pageWindow?.PDFViewerApplication?.pdfViewer?.currentPageNumber || 1) - 1);
  let sentence = annotation?.text || '';
  const chars = view?._pdfPages?.[pageIndex]?.chars;
  if (!sentence && Number.isInteger(anchor.start) && Array.isArray(chars)) {
    const before = chars.slice(Math.max(0, anchor.start - 180), anchor.start).map(char => char.c + (char.spaceAfter ? ' ' : '')).join('');
    const after = chars.slice(anchor.start, Math.min(chars.length, (anchor.end || anchor.start) + 180)).map(char => char.c + (char.spaceAfter ? ' ' : '')).join('');
    sentence = before.split(/[.!?。！？]\s+/).at(-1) + after.split(/[.!?。！？]\s+/)[0];
  }
  let groupID;
  if (library?.libraryType === 'group') groupID = Zotero.Groups?.getGroupIDFromLibraryID?.(item.libraryID);
  const route = library?.libraryType === 'group' ? groupID ? 'groups/' + groupID : '' : 'library';
  const sourceURL = item?.key && route ? `zotero://open-pdf/${route}/items/${encodeURIComponent(item.key)}?page=${pageIndex + 1}` : '';
  return {
    itemID: item?.id || null, itemKey: item?.key || '', libraryID: item?.libraryID || null,
    title: parent?.getField?.('title') || item?.getField?.('title') || '', parentID: item?.parentItemID || null,
    pageIndex, sentence: sentence.replace(/[\u00ad\u200b]/g, '').replace(/\s+/g, ' ').trim().slice(0, 2000), sourceURL,
  };
}
