/* SPDX-License-Identifier: GPL-3.0-or-later */
import { Inflate } from 'pako';
export const MAX_TEXT_FILE = 64 * 1024 * 1024;
export function check(condition, message) { if (!condition) throw new Error(message); }
export async function fileSource(fs, path, guard = () => {}) {
  guard(); const stat = await fs.stat(path); guard();
  check(stat.type === 'regular' && Number.isSafeInteger(stat.size) && stat.size >= 0, '词典文件不可读取：' + path);
  return { size: stat.size, read: async (offset, length) => {
    guard(); check(Number.isSafeInteger(offset) && Number.isSafeInteger(length) && offset >= 0 && length >= 0 && offset + length <= stat.size, '词典读取范围无效。');
    const bytes = await fs.read(path, { offset, maxBytes: length }); guard(); check(bytes.length === length, '词典文件不完整或在读取时发生变化。'); return bytes;
  } };
}
export function inflateBounded(bytes, limit, raw = false) {
  const decoder = new Inflate({ raw, chunkSize: 65536 }), chunks = []; let size = 0;
  decoder.onData = chunk => { size += chunk.length; check(size <= limit, '解压数据超过 ' + Math.floor(limit / 1024 / 1024) + ' MB 限额。'); chunks.push(chunk); };
  check(decoder.push(bytes, true) && decoder.ended && !decoder.err, '压缩词典损坏：' + (decoder.msg || '不完整的数据流'));
  const result = new Uint8Array(size); let at = 0; for (const chunk of chunks) { result.set(chunk, at); at += chunk.length; } return result;
}
export async function readWhole(source, limit = MAX_TEXT_FILE) {
  check(source.size <= limit, '词典文本或索引超过 ' + Math.floor(limit / 1024 / 1024) + ' MB 限额。');
  return source.read(0, source.size);
}
export async function gzipSource(source) {
  check(source.size >= 18, 'Gzip 文件不完整。');
  const header = await source.read(0, 10); check(header[0] === 31 && header[1] === 139 && header[2] === 8 && !(header[3] & 224), '压缩词典不是受支持的 Gzip/Dictzip。');
  let at = 10, table;
  if (header[3] & 4) {
    const bytes = await source.read(at, 2), extraSize = bytes[0] | bytes[1] << 8; at += 2;
    const extra = await source.read(at, extraSize); at += extraSize;
    for (let pos = 0; pos < extra.length;) {
      check(pos + 4 <= extra.length, 'Gzip 扩展字段不完整。');
      const length = extra[pos + 2] | extra[pos + 3] << 8, next = pos + 4 + length; check(next <= extra.length, 'Gzip 扩展字段长度无效。');
      if (extra[pos] === 82 && extra[pos + 1] === 65) {
        const view = new DataView(extra.buffer, extra.byteOffset + pos + 4, length);
        check(length >= 6 && view.getUint16(0, true) === 1, '不支持此 Dictzip 索引版本。');
        const chunkLength = view.getUint16(2, true), count = view.getUint16(4, true);
        check(chunkLength > 0 && count > 0 && length === 6 + count * 2 && !table, 'Dictzip 分块表无效。');
        table = { chunkLength, lengths: Array.from({ length: count }, (_, i) => view.getUint16(6 + i * 2, true)) };
      }
      pos = next;
    }
  }
  for (const flag of [8, 16]) if (header[3] & flag) {
    let ended = false;
    for (let seen = 0; seen < 65536 && at < source.size - 8;) {
      const bytes = await source.read(at, Math.min(1024, source.size - 8 - at)), zero = bytes.indexOf(0);
      at += zero < 0 ? bytes.length : zero + 1; seen += bytes.length;
      if (zero >= 0) { ended = true; break; }
    }
    check(ended, 'Gzip 文件名或注释过长、不完整。');
  }
  if (header[3] & 2) at += 2;
  check(at < source.size - 8, 'Gzip 头部无效。');
  if (!table) {
    const bytes = inflateBounded(await readWhole(source), MAX_TEXT_FILE);
    return { size: bytes.length, read: async (offset, length) => { check(offset >= 0 && length >= 0 && offset + length <= bytes.length, '压缩词典读取范围无效。'); return bytes.subarray(offset, offset + length); }, clearCache() {} };
  }
  const trailer = await source.read(source.size - 8, 8), size = new DataView(trailer.buffer, trailer.byteOffset, 8).getUint32(4, true);
  check(Math.ceil(size / table.chunkLength) === table.lengths.length, 'Dictzip 原始长度与分块表不一致。');
  const offsets = []; for (const length of table.lengths) { check(length > 0, 'Dictzip 压缩块长度无效。'); offsets.push(at); at += length; }
  // dictzip may leave a small final DEFLATE terminator after its last chunk.
  check(at <= source.size - 8 && source.size - 8 - at <= 16, 'Dictzip 分块偏移无效。');
  const cache = new Map(), pending = new Map(); let epoch = 0;
  const block = async index => {
    if (cache.has(index)) { const value = cache.get(index); cache.delete(index); cache.set(index, value); return value; }
    if (!pending.has(index)) {
      const token = epoch;
      pending.set(index, (async () => {
      const packed = await source.read(offsets[index], table.lengths[index]);
      // Full-flush boundaries make chunks independent. A final empty block
      // terminates non-final chunks for a fresh bounded raw inflater.
      const complete = new Uint8Array(packed.length + 5); complete.set(packed); complete.set([1, 0, 0, 255, 255], packed.length);
      const bytes = inflateBounded(complete, table.chunkLength, true);
      check(bytes.length === Math.min(table.chunkLength, size - index * table.chunkLength), 'Dictzip 分块解压长度不匹配。');
      if (token === epoch) { cache.set(index, bytes); if (cache.size > 32) cache.delete(cache.keys().next().value); } return bytes;
      })());
    }
    const job = pending.get(index);
    try { return await job; } finally { if (pending.get(index) === job) pending.delete(index); }
  };
  return { size, clearCache: () => { epoch++; cache.clear(); pending.clear(); }, read: async (offset, length) => {
    check(Number.isSafeInteger(offset) && Number.isSafeInteger(length) && offset >= 0 && length >= 0 && offset + length <= size && length <= MAX_TEXT_FILE, 'Dictzip 读取范围无效。');
    const result = new Uint8Array(length); let written = 0;
    while (written < length) { const index = Math.floor((offset + written) / table.chunkLength), start = (offset + written) % table.chunkLength;
      const bytes = await block(index), count = Math.min(bytes.length - start, length - written); result.set(bytes.subarray(start, start + count), written); written += count; }
    return result;
  } };
}
