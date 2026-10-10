/* SPDX-License-Identifier: GPL-3.0-or-later */
import { parseFragment, serialize } from 'parse5';
import { fileSource, gzipSource, readWhole, check } from './compressed-source.js';
import { IndexedDictionary } from './indexed-dictionary.js';
import { escapeHTML } from './vocabulary.js';
const utf8 = new TextDecoder('utf-8', { fatal: true });
const plain = text => '<p>' + escapeHTML(text).replace(/\n/g, '<br>') + '</p>';
function xmlMeaning(text) {
  const root = parseFragment(text), stack = [...root.childNodes];
  while (stack.length) {
    const node = stack.pop(); stack.push(...(node.childNodes || []));
    if (node.tagName === 'kref') {
      const value = node.attrs?.find(attr => attr.name === 'k')?.value || (node.childNodes || []).map(child => child.value || '').join('');
      node.tagName = node.nodeName = 'a'; node.attrs = [{ name: 'href', value: 'entry://' + encodeURIComponent(value) }];
    }
    if (['def', 'ex', 'ar'].includes(node.tagName)) node.tagName = node.nodeName = 'div';
    if (['tr', 'abr', 'co'].includes(node.tagName)) node.tagName = node.nodeName = 'span';
  }
  return serialize(root);
}
export function starDictMeaning(bytes, sequence, warnings = new Set()) {
  let at = 0, fields = 0; const html = [], view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const field = (type, last) => {
    check(/[a-zA-Z]/.test(type), 'StarDict 释义类型无效。'); let end;
    if (last) end = bytes.length;
    else if (type === type.toLowerCase()) { end = bytes.indexOf(0, at); check(end >= 0, 'StarDict 文本字段缺少结束符。'); }
    else { check(at + 4 <= bytes.length, 'StarDict 二进制字段不完整。'); end = at + 4 + view.getUint32(at, false); at += 4; }
    check(end >= at && end <= bytes.length, 'StarDict 字段长度无效。'); const data = bytes.subarray(at, end); at = end + (!last && type === type.toLowerCase() ? 1 : 0);
    if (type === type.toUpperCase()) { warnings.add('StarDict 内嵌二进制字段 ' + type + ' 暂不显示，请使用外置资源。'); html.push(plain('[' + type + ' 二进制内容暂不显示]')); return; }
    const text = utf8.decode(data).replace(/\0$/, '');
    if (type === 'h') html.push(text.replace(/href=(['"])bword:\/\/(.*?)\1/gi, (_, quote, word) => 'href=' + quote + 'entry://' + word + quote));
    else if (type === 'x') html.push(xmlMeaning(text));
    else if (type === 'r') for (const line of text.split('\n')) {
      const match = line.match(/^(img|snd):(.*)$/); if (!match) continue;
      html.push(match[1] === 'img' ? '<img src="' + escapeHTML(match[2]) + '">' : '<a href="sound://' + escapeHTML(match[2]) + '">播放发音</a>');
    }
    else if (['t', 'y'].includes(type)) html.push('<p class="phon">' + escapeHTML(text) + '</p>');
    else if (type === 'g') html.push(xmlMeaning(text));
    else { if (!['m', 'n'].includes(type)) warnings.add('StarDict 字段 ' + type + ' 以文字显示。'); html.push(plain(text)); }
  };
  if (sequence) for (let i = 0; i < sequence.length; i++) field(sequence[i], i === sequence.length - 1);
  else while (at < bytes.length) { check(++fields <= 128, 'StarDict 字段过多。'); field(String.fromCharCode(bytes[at++]), false); }
  check(at === bytes.length, 'StarDict 释义长度不匹配。'); return html.join('\n');
}
export class StarDictDictionary extends IndexedDictionary {
  static async open(fs, path, guard = () => {}) {
    const dictionary = new StarDictDictionary(), metadata = utf8.decode(await readWhole(await fileSource(fs, path, guard), 1024 * 1024)).replace(/^\uFEFF/, '').split(/\r?\n/);
    check(metadata.shift() === "StarDict's dict ifo file", '这不是 StarDict 词典入口文件。');
    const info = Object.fromEntries(metadata.filter(line => line.includes('=')).map(line => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)]; }));
    check(['2.4.2', '3.0.0'].includes(info.version) && info.bookname, 'StarDict 版本或名称无效。');
    const count = Number(info.wordcount), indexSize = Number(info.idxfilesize), bits = info.idxoffsetbits || '32';
    check(Number.isInteger(count) && count >= 0 && count <= 2000000 && Number.isInteger(indexSize) && indexSize >= 0 && ['32', '64'].includes(bits) && (bits !== '64' || info.version === '3.0.0'), 'StarDict 索引参数无效。');
    check(!info.sametypesequence || /^[a-zA-Z]{1,128}$/.test(info.sametypesequence), 'StarDict 数据类型序列无效。');
    const stem = path.slice(0, -4), directory = path.slice(0, Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))), children = await fs.getChildren(directory); guard();
    const locate = endings => endings.map(ending => children.find(file => file.toLowerCase() === (stem + ending).toLowerCase())).find(Boolean);
    const indexPath = locate(['.idx', '.idx.gz']), dataPath = locate(['.dict.dz', '.dict']); check(indexPath && dataPath, 'StarDict 缺少同名 .idx/.idx.gz 或 .dict/.dict.dz 文件。');
    let index = await fileSource(fs, indexPath, guard); if (/\.gz$/i.test(indexPath)) index = await gzipSource(index);
    const bytes = await readWhole(index), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); check(bytes.length === indexSize, 'StarDict idxfilesize 与实际索引不一致。');
    dictionary.data = await fileSource(fs, dataPath, guard); if (/\.dz$/i.test(dataPath)) dictionary.data = await gzipSource(dictionary.data);
    const rows = []; let at = 0;
    while (at < bytes.length) {
      const zero = bytes.indexOf(0, at), width = Number(bits) / 8; check(zero > at && zero - at < 256 && zero + 1 + width + 4 <= bytes.length, 'StarDict 索引项不完整。');
      const headword = utf8.decode(bytes.subarray(at, zero)); at = zero + 1;
      const offset = width === 8 ? view.getUint32(at, false) * 4294967296 + view.getUint32(at + 4, false) : view.getUint32(at, false); at += width;
      const size = view.getUint32(at, false); at += 4;
      check(Number.isSafeInteger(offset) && size <= 16 * 1024 * 1024 && offset + size <= dictionary.data.size && rows.length < 2000000, 'StarDict 释义偏移或长度无效。');
      const entry = { headword, offset, size }; rows.push(entry); dictionary.addKey(headword, entry);
    }
    check(rows.length === count, 'StarDict wordcount 与实际索引不一致。');
    const synPath = locate(['.syn']);
    if (synPath) {
      const bytes = await readWhole(await fileSource(fs, synPath, guard)), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); let at = 0, synonyms = 0;
      while (at < bytes.length) { const zero = bytes.indexOf(0, at); check(zero > at && zero - at < 256 && zero + 5 <= bytes.length, 'StarDict 同义词索引不完整。'); const word = utf8.decode(bytes.subarray(at, zero)), target = view.getUint32(zero + 1, false); at = zero + 5; check(target < rows.length, 'StarDict 同义词指向不存在的词目。'); dictionary.addKey(word, rows[target]); synonyms++; }
      check(Number(info.synwordcount) === synonyms, 'StarDict synwordcount 与实际索引不一致。');
    } else check(!Number(info.synwordcount), 'StarDict 缺少 .syn 文件。');
    dictionary.sequence = info.sametypesequence || ''; dictionary.count = count; dictionary.bookname = info.bookname;
    dictionary.stats = { entries: count, format: 'StarDict', version: info.version, encoding: 'UTF-8' }; guard(); return dictionary;
  }
  async lookup(word) {
    const results = []; for (const entry of this.entriesFor(word)) { const warnings = new Set(); results.push({ headword: entry.headword, html: starDictMeaning(await this.data.read(entry.offset, entry.size), this.sequence, warnings), warnings: [...warnings] }); } return results;
  }
}
