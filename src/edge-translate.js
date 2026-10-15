/* SPDX-License-Identifier: GPL-3.0-or-later */
const ENDPOINT = 'https://edge.microsoft.com/translate/translatetext?to=zh-Hans&isEnterpriseClient=false';
const TARGET = 'zh-Hans';
const MAX_RESPONSE = 262144, MAX_TEXT = 32768;
const cooldowns = new WeakMap();
const failure = (message, code, details = {}) => Object.assign(new Error(message), { code, ...details });

function parseResponse(xhr, source) {
  const body = xhr.responseText;
  if (typeof body !== 'string' || body.length > MAX_RESPONSE) throw failure('Microsoft returned an invalid response', 'MALFORMED_RESPONSE');
  let data;
  try { data = JSON.parse(body); } catch (_) { throw failure('Microsoft returned an invalid response', 'MALFORMED_RESPONSE'); }
  if (!Array.isArray(data) || data.length !== 1 || !data[0] || typeof data[0] !== 'object' || Array.isArray(data[0]) ||
      Object.hasOwn(data[0], 'error') || (data[0].to !== undefined && data[0].to !== TARGET) || !Array.isArray(data[0].translations) ||
      data[0].translations.length !== 1) throw failure('Microsoft returned an invalid translation structure or target language', 'MALFORMED_RESPONSE');
  const translation = data[0].translations[0];
  if (!translation || typeof translation !== 'object' || Array.isArray(translation) ||
      typeof translation.text !== 'string' || translation.text.length > MAX_TEXT || !translation.text.trim() ||
      (translation.to !== undefined && translation.to !== TARGET) || translation.text.includes('\0')) {
    throw failure('Microsoft returned invalid translation text', 'MALFORMED_RESPONSE');
  }
  if (data[0].to !== TARGET && translation.to !== TARGET) throw failure('Microsoft returned the wrong target language', 'MALFORMED_RESPONSE');
  const detected = data[0].detectedLanguage;
  if (detected !== undefined && (!detected || typeof detected.language !== 'string' || detected.language.length > 64)) {
    throw failure('Microsoft returned an invalid detected language', 'MALFORMED_RESPONSE');
  }
  return [{ type: 'online', sourceId: source.id, text: translation.text, engineId: 'bing',
    ...(detected?.language ? { sourceLanguage: detected.language } : {}), targetLanguage: TARGET }];
}

export function createEdgeTranslator(Zotero, { now = Date.now, timeout = 10000 } = {}) {
  const boundedTimeout = Number.isFinite(timeout) && timeout > 0 ? Math.min(30000, Math.max(1, timeout)) : 10000;
  return async (query, source, scope) => {
    if (scope.cancelled()) throw failure('Query cancelled', 'CANCELLED');
    const retryAt = cooldowns.get(Zotero) || 0;
    if (retryAt > now()) throw failure('Microsoft translation is temporarily rate limited', 'COOLDOWN', { retryAt });
    const text = query.translationText;
    if (typeof text !== 'string' || text.length > 256 || text.trim().split(/\s+/u).filter(Boolean).length > 16) throw failure('Invalid translation query', 'INVALID_QUERY');
    if (!text.trim()) return [];
    let xhr, aborted = false, timedOut = false, timer, off = () => {};
    const abort = () => { if (xhr && !aborted) { aborted = true; try { xhr.abort(); } catch (_) {} } };
    try {
      const result = await new Promise((resolve, reject) => {
        off = scope.onCancel(() => { abort(); reject(failure('Query cancelled', 'CANCELLED')); });
        if (scope.cancelled()) return;
        timer = setTimeout(() => { timedOut = true; abort(); reject(failure('Microsoft request timed out', 'TIMEOUT')); }, boundedTimeout);
        let request;
        try {
          request = Zotero.HTTP.request('POST', ENDPOINT, {
            body: JSON.stringify([text]), headers: { 'Content-Type': 'application/json' },
            responseType: 'text', timeout: boundedTimeout, errorDelayMax: 0,
            noRetryOnThrottle: true, logBodyLength: 0, anon: true,
            requestObserver(value) { xhr = value; if (scope.cancelled() || timedOut) abort(); },
          });
        } catch (error) { reject(error); return; }
        Promise.resolve(request).then(resolve, reject);
      });
      if (scope.cancelled()) throw failure('Query cancelled', 'CANCELLED');
      if (result?.status === 429) throw Object.assign(new Error('Microsoft rate limit'), { status: 429, xmlhttp: result });
      if (!Number.isInteger(result?.status) || result.status < 200 || result.status >= 300) throw failure('Microsoft HTTP ' + (result?.status ?? 'unknown'), 'HTTP_ERROR');
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
        throw failure('Microsoft translation is temporarily rate limited', 'COOLDOWN', { retryAt: cooldowns.get(Zotero) });
      }
      throw error;
    } finally { clearTimeout(timer); off(); }
  };
}
