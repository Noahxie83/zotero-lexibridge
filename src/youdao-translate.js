/* SPDX-License-Identifier: GPL-3.0-or-later */
const ENDPOINT = 'https://aidemo.youdao.com/trans';
const MAX_RESPONSE = 262144, MAX_TEXT = 32768;
const cooldowns = new WeakMap();
const failure = (message, code, details = {}) => Object.assign(new Error(message), { code, ...details });

function parseResponse(xhr, source) {
  const body = xhr?.responseText;
  if (typeof body !== 'string' || body.length > MAX_RESPONSE) throw failure('有道返回了无效响应。', 'MALFORMED_RESPONSE');
  let data;
  try { data = JSON.parse(body); } catch (_) { throw failure('有道返回了无效响应。', 'MALFORMED_RESPONSE'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw failure('有道返回了无效响应。', 'MALFORMED_RESPONSE');
  if (data.errorCode !== '0' && data.errorCode !== 0) {
    const code = typeof data.errorCode === 'string' || typeof data.errorCode === 'number' ? String(data.errorCode).slice(0, 32) : 'unknown';
    throw failure('有道翻译服务返回错误（' + code + '）。', 'PROVIDER_ERROR');
  }
  if (!Array.isArray(data.translation) || !data.translation.length || data.translation.length > 16 ||
      data.translation.some(text => typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT || text.includes('\0'))) {
    throw failure('有道返回了无效译文。', 'MALFORMED_RESPONSE');
  }
  if (data.to !== undefined && data.to !== 'zh-CHS') throw failure('有道返回了非预期目标语言。', 'MALFORMED_RESPONSE');
  const text = data.translation.join('\n');
  if (text.length > MAX_TEXT) throw failure('有道译文超出长度限制。', 'MALFORMED_RESPONSE');
  const from = typeof data.from === 'string' && /^[a-z]{2,3}(?:-[A-Z]{2,4})?$/.test(data.from) ? data.from : undefined;
  return [{ type: 'online', sourceId: source.id, text, engineId: 'youdao',
    ...(from ? { sourceLanguage: from } : {}), targetLanguage: 'zh-CHS' }];
}

export function createYoudaoTranslator(Zotero, { now = Date.now, timeout = 10000 } = {}) {
  const boundedTimeout = Number.isFinite(timeout) && timeout > 0 ? Math.min(30000, Math.max(1, timeout)) : 10000;
  return async (query, source, scope) => {
    if (scope.cancelled()) throw failure('查询已取消。', 'CANCELLED');
    const retryAt = cooldowns.get(Zotero) || 0;
    if (retryAt > now()) throw failure('有道翻译服务处于冷却期。', 'COOLDOWN', { retryAt });
    const text = query.translationText;
    if (typeof text !== 'string' || text.length > 256 || text.trim().split(/\s+/u).filter(Boolean).length > 16) throw failure('查询文本超出翻译范围。', 'INVALID_QUERY');
    if (!text.trim()) return [];
    const body = new URLSearchParams({ from: 'auto', to: 'zh-CHS', q: text }).toString();
    let xhr, aborted = false, timedOut = false, timer, off = () => {};
    const abort = () => { if (xhr && !aborted) { aborted = true; try { xhr.abort(); } catch (_) {} } };
    try {
      const result = await new Promise((resolve, reject) => {
        off = scope.onCancel(() => { abort(); reject(failure('查询已取消。', 'CANCELLED')); });
        if (scope.cancelled()) return;
        timer = setTimeout(() => { timedOut = true; abort(); reject(failure('有道请求超时。', 'TIMEOUT')); }, boundedTimeout);
        let request;
        try {
          request = Zotero.HTTP.request('POST', ENDPOINT, {
            body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, responseType: 'text', timeout: boundedTimeout,
            errorDelayMax: 0, noRetryOnThrottle: true, logBodyLength: 0, anon: true,
            requestObserver(value) { xhr = value; if (scope.cancelled() || timedOut) abort(); },
          });
        } catch (error) { reject(error); return; }
        Promise.resolve(request).then(resolve, reject);
      });
      if (scope.cancelled()) throw failure('查询已取消。', 'CANCELLED');
      if (result?.status === 429) throw Object.assign(new Error('rate limited'), { status: 429, xmlhttp: result });
      if (!Number.isInteger(result?.status) || result.status < 200 || result.status >= 300) throw failure('有道 HTTP ' + (Number.isInteger(result?.status) ? result.status : 'unknown'), 'HTTP_ERROR');
      return parseResponse(result, source);
    } catch (error) {
      if (scope.cancelled()) throw failure('查询已取消。', 'CANCELLED');
      if (error.status === 429 || error.xmlhttp?.status === 429) {
        let header;
        try { header = error.xmlhttp?.getResponseHeader('Retry-After'); } catch (_) {}
        const seconds = typeof header === 'string' && /^\s*\d+(?:\.\d+)?\s*$/.test(header) ? Number(header) : NaN;
        const date = typeof header === 'string' ? Date.parse(header) : NaN;
        const current = now(), next = Number.isFinite(seconds) ? current + seconds * 1000 : Number.isFinite(date) && date > current ? date : current + 60000;
        cooldowns.set(Zotero, Math.max(cooldowns.get(Zotero) || 0, next));
        throw failure('有道翻译服务暂时限流。', 'COOLDOWN', { retryAt: cooldowns.get(Zotero) });
      }
      if (['HTTP_ERROR', 'PROVIDER_ERROR', 'MALFORMED_RESPONSE', 'TIMEOUT', 'INVALID_QUERY', 'COOLDOWN', 'CANCELLED'].includes(error?.code)) throw error;
      if (Number.isInteger(error?.status)) throw failure('有道 HTTP ' + error.status, 'HTTP_ERROR');
      throw failure('有道请求失败，请检查网络或代理设置。', 'NETWORK_ERROR');
    } finally { clearTimeout(timer); off(); }
  };
}
