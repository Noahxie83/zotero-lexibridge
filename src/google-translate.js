/* SPDX-License-Identifier: GPL-3.0-or-later */
const ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const MAX_RESPONSE = 262144, MAX_TEXT = 32768;
const cooldowns = new WeakMap();
const failure = (message, code, details = {}) => Object.assign(new Error(message), { code, ...details });
function parseResponse(xhr, source) {
  const body = xhr.responseText;
  if (typeof body !== 'string' || body.length > MAX_RESPONSE) throw failure('Invalid Google response', 'MALFORMED_RESPONSE');
  let data;
  try { data = JSON.parse(body); } catch (_) { throw failure('Invalid Google response', 'MALFORMED_RESPONSE'); }
  if (!Array.isArray(data) || !Array.isArray(data[0]) || !data[0].length || data[0].length > 1024) throw failure('Invalid Google response segments', 'MALFORMED_RESPONSE');
  let text = '';
  for (const segment of data[0]) {
    if (!Array.isArray(segment) || typeof segment[0] !== 'string' || (segment[1] !== undefined && segment[1] !== null && typeof segment[1] !== 'string')) throw failure('Invalid Google response segment', 'MALFORMED_RESPONSE');
    text += segment[0];
    if (text.length > MAX_TEXT) throw failure('Google translation is too long', 'MALFORMED_RESPONSE');
  }
  if (data[2] !== undefined && data[2] !== null && (typeof data[2] !== 'string' || data[2].length > 64)) throw failure('Invalid Google source language', 'MALFORMED_RESPONSE');
  if (!text.trim()) return [];
  return [{ type: 'online', sourceId: source.id, text, engineId: 'google',
    ...(typeof data[2] === 'string' ? { sourceLanguage: data[2] } : {}), targetLanguage: 'zh-CN' }];
}
export function createGoogleTranslator(Zotero, { now = Date.now, timeout = 10000 } = {}) {
  const boundedTimeout = Number.isFinite(timeout) && timeout > 0 ? Math.min(30000, Math.max(1, timeout)) : 10000;
  return async (query, source, scope) => {
    if (scope.cancelled()) throw failure('Query cancelled', 'CANCELLED');
    const retryAt = cooldowns.get(Zotero) || 0;
    if (retryAt > now()) throw failure('Google translation is temporarily rate limited', 'COOLDOWN', { retryAt });
    const text = query.translationText;
    if (typeof text !== 'string' || text.length > 256 || text.trim().split(/\s+/u).filter(Boolean).length > 16) throw failure('Invalid translation query', 'INVALID_QUERY');
    if (!text.trim()) return [];
    const url = ENDPOINT + '?client=gtx&sl=auto&tl=zh-CN&dt=t&q=' + encodeURIComponent(text);
    let xhr, aborted = false, timedOut = false, timer, off = () => {};
    const abort = () => { if (xhr && !aborted) { aborted = true; try { xhr.abort(); } catch (_) {} } };
    try {
      const result = await new Promise((resolve, reject) => {
        off = scope.onCancel(() => { abort(); reject(failure('Query cancelled', 'CANCELLED')); });
        if (scope.cancelled()) return;
        timer = setTimeout(() => { timedOut = true; abort(); reject(failure('Google request timed out', 'TIMEOUT')); }, boundedTimeout);
        let request;
        try {
          request = Zotero.HTTP.request('GET', url, {
            responseType: 'text', timeout: boundedTimeout, errorDelayMax: 0,
            anon: true,
            // Zotero checks Retry-After before errorDelayMax, so both are needed.
            noRetryOnThrottle: true, logBodyLength: 0,
            requestObserver(value) { xhr = value; if (scope.cancelled() || timedOut) abort(); },
          });
        } catch (error) { reject(error); return; }
        Promise.resolve(request).then(resolve, reject);
      });
      if (scope.cancelled()) throw failure('Query cancelled', 'CANCELLED');
      if (result?.status === 429) throw Object.assign(new Error('Google rate limit'), { status: 429, xmlhttp: result });
      if (!Number.isInteger(result?.status) || result.status < 200 || result.status >= 300) {
        throw failure('Google HTTP ' + (Number.isInteger(result?.status) ? result.status : 'unknown'), 'HTTP_ERROR');
      }
      return parseResponse(result, source);
    } catch (error) {
      if (scope.cancelled()) throw failure('Query cancelled', 'CANCELLED');
      if (error.status === 429 || error.xmlhttp?.status === 429) {
        let header;
        try { header = error.xmlhttp?.getResponseHeader('Retry-After'); } catch (_) {}
        const current = now();
        const seconds = typeof header === 'string' && /^\s*\d+(?:\.\d+)?\s*$/.test(header) ? Number(header) : NaN;
        const date = typeof header === 'string' ? Date.parse(header) : NaN;
        const next = Number.isFinite(seconds) ? current + seconds * 1000 : Number.isFinite(date) && date > current ? date : current + 60000;
        cooldowns.set(Zotero, Math.max(cooldowns.get(Zotero) || 0, next));
        throw failure('Google translation is temporarily rate limited', 'COOLDOWN', { retryAt: cooldowns.get(Zotero) });
      }
      if (['HTTP_ERROR', 'MALFORMED_RESPONSE', 'TIMEOUT', 'INVALID_QUERY', 'COOLDOWN', 'CANCELLED'].includes(error?.code)) throw error;
      if (Number.isInteger(error?.status)) throw failure('Google HTTP ' + error.status, 'HTTP_ERROR');
      throw failure('Google request failed; check network or proxy settings.', 'NETWORK_ERROR');
    } finally { clearTimeout(timer); off(); }
  };
}
