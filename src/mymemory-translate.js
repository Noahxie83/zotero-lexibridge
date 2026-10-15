/* SPDX-License-Identifier: GPL-3.0-or-later */
const ENDPOINT = 'https://api.mymemory.translated.net/get';
const MAX_RESPONSE = 262144, MAX_TEXT = 32768;
const cooldowns = new WeakMap();
const failure = (message, code, details = {}) => Object.assign(new Error(message), { code, ...details });

function parseResponse(xhr, source) {
  const body = xhr?.responseText;
  if (typeof body !== 'string' || body.length > MAX_RESPONSE) throw failure('MyMemory returned an invalid response.', 'MALFORMED_RESPONSE');
  let data;
  try { data = JSON.parse(body); } catch (_) { throw failure('MyMemory returned an invalid response.', 'MALFORMED_RESPONSE'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw failure('MyMemory returned an invalid response.', 'MALFORMED_RESPONSE');
  if (data.quotaFinished !== undefined && data.quotaFinished !== false) throw failure('MyMemory translation quota is exhausted.', 'COOLDOWN');
  if (data.responseStatus !== 200) throw failure('MyMemory returned a service error.', 'PROVIDER_ERROR');
  const text = data.responseData?.translatedText;
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT || text.includes('\0')) throw failure('MyMemory returned invalid translation text.', 'MALFORMED_RESPONSE');
  return [{ type: 'online', sourceId: source.id, text, engineId: 'mymemory', sourceLanguage: 'en', targetLanguage: 'zh-CN' }];
}

export function createMyMemoryTranslator(Zotero, { now = Date.now, timeout = 10000 } = {}) {
  const boundedTimeout = Number.isFinite(timeout) && timeout > 0 ? Math.min(30000, Math.max(1, timeout)) : 10000;
  return async (query, source, scope) => {
    if (scope.cancelled()) throw failure('Query cancelled.', 'CANCELLED');
    const retryAt = cooldowns.get(Zotero) || 0;
    if (retryAt > now()) throw failure('MyMemory translation is temporarily rate limited.', 'COOLDOWN', { retryAt });
    const text = query.translationText;
    if (typeof text !== 'string' || text.length > 256 || text.trim().split(/\s+/u).filter(Boolean).length > 16) throw failure('Query exceeds translation limits.', 'INVALID_QUERY');
    if (!text.trim()) return [];
    const params = new URLSearchParams({ q: text, langpair: 'en|zh-CN' });
    const url = ENDPOINT + '?' + params.toString();
    let xhr, aborted = false, timedOut = false, timer, off = () => {};
    const abort = () => { if (xhr && !aborted) { aborted = true; try { xhr.abort(); } catch (_) {} } };
    try {
      const result = await new Promise((resolve, reject) => {
        off = scope.onCancel(() => { abort(); reject(failure('Query cancelled.', 'CANCELLED')); });
        if (scope.cancelled()) return;
        timer = setTimeout(() => { timedOut = true; abort(); reject(failure('MyMemory request timed out.', 'TIMEOUT')); }, boundedTimeout);
        let request;
        try {
          request = Zotero.HTTP.request('GET', url, {
            responseType: 'text', timeout: boundedTimeout, errorDelayMax: 0, noRetryOnThrottle: true, logBodyLength: 0, anon: true,
            requestObserver(value) { xhr = value; if (scope.cancelled() || timedOut) abort(); },
          });
        } catch (error) { reject(error); return; }
        Promise.resolve(request).then(resolve, reject);
      });
      if (scope.cancelled()) throw failure('Query cancelled.', 'CANCELLED');
      if (result?.status === 429) throw Object.assign(new Error('rate limited'), { status: 429, xmlhttp: result });
      if (!Number.isInteger(result?.status) || result.status < 200 || result.status >= 300) throw failure('MyMemory HTTP ' + (Number.isInteger(result?.status) ? result.status : 'unknown'), 'HTTP_ERROR');
      try { return parseResponse(result, source); }
      catch (error) {
        if (error.code === 'COOLDOWN') {
          const retry = now() + 60000;
          cooldowns.set(Zotero, Math.max(cooldowns.get(Zotero) || 0, retry));
          throw failure(error.message, 'COOLDOWN', { retryAt: cooldowns.get(Zotero) });
        }
        throw error;
      }
    } catch (error) {
      if (scope.cancelled()) throw failure('Query cancelled.', 'CANCELLED');
      if (error.status === 429 || error.xmlhttp?.status === 429) {
        let header;
        try { header = error.xmlhttp?.getResponseHeader('Retry-After'); } catch (_) {}
        const seconds = typeof header === 'string' && /^\s*\d+(?:\.\d+)?\s*$/.test(header) ? Number(header) : NaN;
        const date = typeof header === 'string' ? Date.parse(header) : NaN;
        const current = now(), next = Number.isFinite(seconds) ? current + seconds * 1000 : Number.isFinite(date) && date > current ? date : current + 60000;
        cooldowns.set(Zotero, Math.max(cooldowns.get(Zotero) || 0, next));
        throw failure('MyMemory translation is temporarily rate limited.', 'COOLDOWN', { retryAt: cooldowns.get(Zotero) });
      }
      if (['HTTP_ERROR', 'PROVIDER_ERROR', 'MALFORMED_RESPONSE', 'TIMEOUT', 'INVALID_QUERY', 'COOLDOWN', 'CANCELLED'].includes(error?.code)) throw error;
      if (Number.isInteger(error?.status)) throw failure('MyMemory HTTP ' + error.status, 'HTTP_ERROR');
      throw failure('MyMemory request failed; check network or proxy settings.', 'NETWORK_ERROR');
    } finally { clearTimeout(timer); off(); }
  };
}
