// Explicit, bounded ordinary-program probes. Never called by the test suite.
const enabled = new Set(process.argv.slice(2).filter(arg => ['--youdao', '--mymemory'].includes(arg)));
if (!process.argv.includes('--network') || !enabled.size) {
  throw new Error('Pass --network and one or both of --youdao / --mymemory; each provider is called at most once.');
}
const text = 'hello';
const report = { kind: 'ordinary Node fetch probe (not Zotero)', sample: text, requests: [] };
async function run(provider, request, parse) {
  const record = { provider, method: request.method, endpoint: request.endpoint, requestCount: 1 };
  try {
    const response = await fetch(request.url, { method: request.method, headers: request.headers, body: request.body, signal: AbortSignal.timeout(10000) });
    record.httpStatus = response.status;
    record.contentType = response.headers.get('content-type')?.split(';', 1)[0] || null;
    if (!response.ok) { report.requests.push(record); return; }
    const data = await response.json();
    Object.assign(record, parse(data));
  } catch (error) {
    record.error = error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'timeout' : 'network-or-parse-error';
  }
  report.requests.push(record);
}
if (enabled.has('--youdao')) {
  const form = new URLSearchParams({ from: 'auto', to: 'zh-CHS', q: text });
  await run('youdao', { method: 'POST', endpoint: 'https://aidemo.youdao.com/trans', url: 'https://aidemo.youdao.com/trans',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() }, data => ({
    errorCode: String(data.errorCode ?? 'missing'), translated: data.errorCode === '0' || data.errorCode === 0 ? data.translation?.slice(0, 4) : undefined,
  }));
}
if (enabled.has('--mymemory')) {
  const url = new URL('https://api.mymemory.translated.net/get'); url.searchParams.set('q', text); url.searchParams.set('langpair', 'en|zh-CN');
  await run('mymemory', { method: 'GET', endpoint: url.origin + url.pathname, url: url.href }, data => ({
    responseStatus: data.responseStatus, quotaFinished: data.quotaFinished === true,
    translated: data.responseStatus === 200 && data.quotaFinished !== true ? data.responseData?.translatedText?.slice(0, 32768) : undefined,
  }));
}
console.log(JSON.stringify(report, null, 2));
