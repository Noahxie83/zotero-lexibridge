import { gzipSync, deflateRawSync, constants, gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
export function formatFS(files) {
  return { stat: async path => { if (Object.hasOwn(files, path)) return { type: 'regular', size: files[path].length }; if (Object.keys(files).some(file => file.startsWith(path + '/'))) return { type: 'directory' }; const error = new Error('missing: ' + path); error.name = 'NotFoundError'; throw error; },
    getChildren: async path => Object.keys(files).filter(file => file.slice(0, file.lastIndexOf('/')) === path),
    read: async (path, { offset, maxBytes }) => files[path].subarray(offset, offset + maxBytes) };
}
function crc32(bytes) { let value = 0xffffffff; for (const byte of bytes) { value ^= byte; for (let bit = 0; bit < 8; bit++) value = value >>> 1 ^ (value & 1 ? 0xedb88320 : 0); } return (value ^ 0xffffffff) >>> 0; }
export function dictzip(bytes, chunkLength = 64) {
  const chunks = []; for (let at = 0; at < bytes.length; at += chunkLength) chunks.push(deflateRawSync(bytes.subarray(at, at + chunkLength), { finishFlush: constants.Z_FULL_FLUSH }));
  const extraLength = 10 + chunks.length * 2, header = Buffer.alloc(12 + extraLength);
  header.set([31, 139, 8, 4, 0, 0, 0, 0, 0, 3]); header.writeUInt16LE(extraLength, 10); header.write('RA', 12); header.writeUInt16LE(extraLength - 4, 14);
  header.writeUInt16LE(1, 16); header.writeUInt16LE(chunkLength, 18); header.writeUInt16LE(chunks.length, 20);
  chunks.forEach((chunk, index) => header.writeUInt16LE(chunk.length, 22 + index * 2));
  const trailer = Buffer.alloc(8); trailer.writeUInt32LE(crc32(bytes), 0); trailer.writeUInt32LE(bytes.length, 4);
  const packed = Buffer.concat([header, ...chunks, Buffer.from([1, 0, 0, 255, 255]), trailer]); assert.deepEqual(gunzipSync(packed), bytes); return packed;
}
export function makeStarDict(stem, rows, { sequence = 'h', bits = 32, compressedIndex = false, compressedData = false, synonyms = [], randomAccess = false } = {}) {
  let offset = 0; const entries = [], definitions = [];
  for (const [word, meaning] of rows) {
    const bytes = Buffer.isBuffer(meaning) ? meaning : Buffer.from(meaning), wordBytes = Buffer.from(word), record = Buffer.alloc(wordBytes.length + 1 + bits / 8 + 4); wordBytes.copy(record);
    if (bits === 64) record.writeBigUInt64BE(BigInt(offset), wordBytes.length + 1); else record.writeUInt32BE(offset, wordBytes.length + 1);
    record.writeUInt32BE(bytes.length, wordBytes.length + 1 + bits / 8); entries.push(record); definitions.push(bytes); offset += bytes.length;
  }
  const index = Buffer.concat(entries), data = Buffer.concat(definitions), files = {};
  files[stem + '.ifo'] = Buffer.from("StarDict's dict ifo file\nversion=" + (bits === 64 ? '3.0.0' : '2.4.2') + '\nbookname=Example\nwordcount=' + rows.length + '\nidxfilesize=' + index.length + '\nidxoffsetbits=' + bits + '\n' + (sequence ? 'sametypesequence=' + sequence + '\n' : '') + (synonyms.length ? 'synwordcount=' + synonyms.length + '\n' : ''));
  files[stem + (compressedIndex ? '.idx.gz' : '.idx')] = compressedIndex ? gzipSync(index) : index;
  files[stem + (compressedData || randomAccess ? '.dict.dz' : '.dict')] = randomAccess ? dictzip(data) : compressedData ? gzipSync(data) : data;
  if (synonyms.length) files[stem + '.syn'] = Buffer.concat(synonyms.map(([word, target]) => { const bytes = Buffer.from(word), result = Buffer.alloc(bytes.length + 5); bytes.copy(result); result.writeUInt32BE(target, bytes.length + 1); return result; }));
  return files;
}
