/* SPDX-License-Identifier: GPL-3.0-or-later */
import { fileSource, gzipSource, readWhole, check } from './compressed-source.js';
import { IndexedDictionary } from './indexed-dictionary.js';
import { escapeHTML } from './vocabulary.js';
export function dslHeadwords(heading) {
  const escapes = [], protectedText = heading.replace(/\\(.)/g, (_, char) => { escapes.push(char); return '\uE000' + (escapes.length - 1) + '\uE001'; }).replace(/\{[^{}]*\}/g, '');
  let variants = [protectedText];
  for (let count = 0; count < 5 && variants.some(word => /\([^()]*\)/.test(word)); count++) {
    variants = variants.flatMap(word => { const match = word.match(/\(([^()]*)\)/); return match ? [word.replace(match[0], match[1]), word.replace(match[0], '')] : [word]; }).slice(0, 32);
  }
  return [...new Set(variants.map(word => word.replace(/\uE000(\d+)\uE001/g, (_, at) => escapes[at]).trim()).filter(Boolean))];
}
function expandTilde(text, heading) {
  return text.replace(/\\[\s\S]|\^?~/g, value => value.startsWith('\\') ? value : value === '^~' ? (heading[0]?.toUpperCase() === heading[0] ? heading[0]?.toLowerCase() : heading[0]?.toUpperCase()) + heading.slice(1) : heading);
}
export function dslMeaning(body, heading, warnings = new Set()) {
  const escaped = [];
  // Protect escaped characters before recognizing resource/link tags. Also
  // protect literal placeholder characters so source text cannot mimic a token.
  const protect = value => { escaped.push(value); return '\uE004' + (escaped.length - 1) + '\uE005'; };
  const insertions = [];
  const insert = html => { insertions.push(html); return '\uE002' + (insertions.length - 1) + '\uE003'; };
  const restore = text => text.replace(/\uE004(\d+)\uE005/g, (_, index) => escaped[Number(index)]);
  const unescape = text => restore(expandTilde(text, heading)).trim();
  let text = body.replace(/\\([\s\S])|([\uE002-\uE005])/g, (_, char, literal) => protect(char ?? literal))
    .replace(/^[ \t]+/gm, '').replace(/^@\s*(.*)$/gm, (_, value) => value ? '[b]' + value + '[/b]' : '');
  text = text.replace(/\[s\]([\s\S]*?)\[\/s\]/gi, (_, value) => {
    const file = unescape(value);
    if (/\.(?:png|jpe?g|gif|webp|bmp|svg)$/i.test(file)) return insert('<img src="' + escapeHTML(file) + '" alt="' + escapeHTML(file) + '">');
    if (/\.(?:wav|mp3|ogg|oga|spx|flac|m4a|aac)$/i.test(file)) return insert('<a href="sound://' + escapeHTML(file) + '">播放发音</a>');
    warnings.add('DSL 资源暂不显示：' + file); return insert('<span>' + escapeHTML(file) + '</span>');
  });
  text = text.replace(/\[ref([^\]]*)\]([\s\S]*?)\[\/ref\]|<<([^<>\n]+)>>/gi, (_, attributes, value, shorthand) => {
    const target = unescape((value || shorthand || '').replace(/\[[^\]]*\]/g, ''));
    if (attributes && /\bdict\s*=/i.test(attributes)) { warnings.add('DSL 跨词典引用仅显示文字：' + target); return insert(escapeHTML(target)); }
    return insert('<a href="entry://' + encodeURIComponent(target) + '">' + escapeHTML(target) + '</a>');
  });
  const html = [], stack = [], tags = { b: 'b', i: 'i', u: 'u', sub: 'sub', sup: 'sup', trn: 'span', ex: 'i', com: 'span', t: 'span', p: 'span', lang: 'span', '*': 'span' };
  const tokens = /\uE002(\d+)\uE003|\uE004(\d+)\uE005|\[([^\]\n]{1,512})\]|\^?~/g; let at = 0, match;
  const appendText = value => html.push(escapeHTML(value).replace(/\n/g, '<br>'));
  while ((match = tokens.exec(text))) {
    appendText(text.slice(at, match.index)); at = tokens.lastIndex;
    if (match[1] != null) { html.push(insertions[Number(match[1])] || ''); continue; }
    if (match[2] != null) { appendText(escaped[Number(match[2])]); continue; }
    if (match[3] == null) { appendText(expandTilde(match[0], heading)); continue; }
    const token = match[3].trim(), closing = token.startsWith('/'), name = token.replace(/^\//, '').split(/\s/)[0].toLowerCase().replace(/^m\d$/, 'm');
    if (closing) {
      const index = stack.map(frame => frame.name).lastIndexOf(name);
      if (index >= 0) while (stack.length > index) html.push('</' + stack.pop().tag + '>');
      continue;
    }
    let tag = tags[name], attributes = '';
    if (name === 'm') { tag = 'div'; const depth = token.match(/^m(\d)/i)?.[1] || 0; attributes = ' style="margin-left:' + Number(depth) * 10 + 'px"'; }
    if (name === 'c') { tag = 'span'; const color = token.slice(1).trim(); if (/^(?:[a-z]{1,20}|#[\da-f]{3,8})$/i.test(color)) attributes = ' style="color:' + color + '"'; }
    if (tag) { check(stack.length < 100, 'DSL 标记嵌套过深。'); html.push('<' + tag + attributes + '>'); stack.push({ name, tag }); }
    else if (!['!trs', 'url'].includes(name)) warnings.add('DSL 标记按文字内容显示：' + name);
  }
  appendText(text.slice(at)); while (stack.length) html.push('</' + stack.pop().tag + '>'); return html.join('');
}
function decodeDSL(bytes) {
  if (bytes[0] === 255 && bytes[1] === 254) return { text: new TextDecoder('utf-16le', { fatal: true }).decode(bytes), encoding: 'UTF-16LE' };
  if (bytes[0] === 254 && bytes[1] === 255) return { text: new TextDecoder('utf-16be', { fatal: true }).decode(bytes), encoding: 'UTF-16BE' };
  if (bytes[0] === 35 && bytes[1] === 0) return { text: new TextDecoder('utf-16le', { fatal: true }).decode(bytes), encoding: 'UTF-16LE' };
  const probe = new TextDecoder().decode(bytes.subarray(0, 4096)), page = probe.match(/^#SOURCE_CODE_PAGE\s+"([^"]+)"/m)?.[1];
  const encoding = { Cyrillic: 'windows-1251', Latin: 'windows-1252', EasternEuropean: 'windows-1250' }[page] || 'utf-8';
  check(!page || ['Cyrillic', 'Latin', 'EasternEuropean', 'UTF-8', 'Unicode'].includes(page), '不支持此 DSL 代码页：' + page);
  return { text: new TextDecoder(encoding, { fatal: true }).decode(bytes).replace(/^\uFEFF/, ''), encoding };
}
export class DSLDictionary extends IndexedDictionary {
  static async open(fs, path, guard = () => {}) {
    let source = await fileSource(fs, path, guard); if (/\.dz$/i.test(path)) source = await gzipSource(source);
    const decoded = decodeDSL(await readWhole(source)), dictionary = new DSLDictionary(); dictionary.text = decoded.text.replace(/(?<!\\)\{\{[\s\S]*?\}\}/g, '').replace(/\r\n?/g, '\n');
    dictionary.bookname = dictionary.text.match(/^#NAME\s+"([^"]+)"/m)?.[1]; check(dictionary.bookname, 'DSL 缺少 #NAME 词典名称。');
    check(!/^#INCLUDE\b/m.test(dictionary.text), 'DSL #INCLUDE 暂不支持，请先合并源文件。');
    let heads = [], start = -1, sub;
    const add = (names, begin, end, base) => {
      if (!names.length || begin < 0) return;
      check(end - begin <= 4 * 1024 * 1024 && dictionary.count < 2000000, 'DSL 词条过大或词目过多。');
      for (const heading of names) {
        const variants = dslHeadwords(expandTilde(heading, base || heading));
        for (const headword of variants) dictionary.addKey(headword, { headword, start: begin, end, base: base || variants[0] });
      }
      dictionary.count++;
    };
    const finishSub = end => { if (sub) add([sub.headword], sub.start, end, dslHeadwords(heads[0] || '')[0]); sub = undefined; };
    const finish = end => { check(!heads.length || start >= 0, 'DSL 词目缺少释义。'); finishSub(end); add(heads, start, end); heads = []; start = -1; };
    const lines = /([^\n]*)(?:\n|$)/g; let match;
    while ((match = lines.exec(dictionary.text)) && match[0]) {
      guard(); const line = match[1], position = match.index;
      if (!line.trim()) continue;
      if (line.startsWith('#')) { check(!heads.length && start < 0, 'DSL 文件头不能位于词条中。'); continue; }
      if (/^[ \t]/.test(line)) {
        check(heads.length, 'DSL 释义缺少词目。'); if (start < 0) start = position;
        const marker = line.trimStart(); if (marker.startsWith('@')) { finishSub(position); if (marker.slice(1).trim()) sub = { headword: marker.slice(1).trim(), start: lines.lastIndex }; }
      } else { if (start >= 0) finish(position); heads.push(line.trim()); }
    }
    finish(dictionary.text.length); check(dictionary.count > 0, 'DSL 未找到有效词条。');
    dictionary.stats = { entries: dictionary.count, format: 'DSL', encoding: decoded.encoding }; guard(); return dictionary;
  }
  async lookup(word) { return this.entriesFor(word).map(entry => { const warnings = new Set(); return { headword: entry.headword, html: dslMeaning(this.text.slice(entry.start, entry.end), entry.base, warnings), warnings: [...warnings] }; }); }
}
