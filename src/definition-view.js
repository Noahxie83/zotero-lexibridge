/* SPDX-License-Identifier: GPL-3.0-or-later */
import { element, renderDefinition } from './render.js';
import { ResourceScope, prepareNativeDefinition, mountNativeDefinition } from './native-render.js';

// Text appears before any resource I/O. Only two entries prepare concurrently;
// every entry retains its own dictionary's resource root and cancellation scope.
export function displayResults({ doc, current, results, win, original, loadResources, isCurrent, onEntry, onStatus, onDiagnostics, appearance = {}, onAudio }) {
  const scopes = new Map(), jobs = new Map(), disposers = [];
  let closed = false, shown = 0;
  const active = () => !closed && isCurrent();
  const close = () => { closed = true; disposers.forEach(dispose => dispose()); for (const scope of scopes.values()) scope.close(); };
  const scopeFor = path => {
    if (!jobs.has(path)) jobs.set(path, (async () => {
      const resources = await loadResources(path); if (!active()) throw new Error('查询已结束。');
      const scope = new ResourceScope(resources, win); scopes.set(path, scope); return scope;
    })());
    return jobs.get(path);
  };
  const diagnostics = () => {
    const details = [], sources = [];
    for (const [path, scope] of scopes) {
      details.push(...[...scope.missing, ...scope.resources.errors].map(issue => path.split(/[\\/]/).pop() + '：' + issue));
      sources.push(path + '\n资源目录候选：' + scope.resources.folders.join(' → ') + '\nMDD 优先顺序：' + (scope.resources.archives.join(' → ') || '无'));
    }
    onDiagnostics?.(details, sources);
  };
  const more = element(doc, 'button', '显示更多释义'); more.type = 'button'; more.className = 'load-more';
  const batch = async () => {
    more.disabled = true; more.remove();
    const entries = results.slice(shown, shown + 12); shown += entries.length;
    const sections = entries.map(result => {
      const section = element(doc, 'section'); section.className = 'result-section';
      const label = element(doc, 'div', result.dictionaryName + ' · ' + result.headword + (result.kind === 'form' ? '（词形命中）' : ''));
      label.className = 'query-match'; section.append(label);
      const content = element(doc, 'div'); content.className = 'result-content';
      try { content.append(renderDefinition(doc, result.html)); } catch (error) { content.textContent = error.message; }
      section.append(content); current.body.append(section); return { result, content };
    });
    if (shown < results.length) { more.textContent = `显示更多释义（${shown}/${results.length}）`; current.body.append(more); }
    current.position();
    if (original) {
      let cursor = 0;
      const worker = async () => {
        while (active() && cursor < sections.length) {
          const { result, content } = sections[cursor++];
          try {
            const scope = await scopeFor(result.dictionaryPath);
            const plan = await prepareNativeDefinition(result.html, scope);
            if (!active()) return;
            content.replaceChildren(); content.style.padding = '0';
            disposers.push(mountNativeDefinition(doc, content, plan, scope, {
              onEntry: entry => onEntry(entry, result.dictionaryPath), onStatus, onResize: () => { if (active()) current.position(); }, onClose: current.close,
              appearance, onAudio, onResourceStatus: diagnostics, onShortcut: () => current.queryInput?.focus(),
              onError: error => { if (active()) { content.replaceChildren(renderDefinition(doc, result.html)); onStatus?.('原有排版显示失败，已保留文字释义：' + error.message); } },
            }));
          } catch (error) { if (active()) onDiagnostics?.([result.dictionaryName + '：' + error.message]); }
        }
      };
      await Promise.all([worker(), worker()]);
    }
    if (active()) { more.disabled = false; diagnostics(); current.position(); }
  };
  more.addEventListener('click', () => { void batch().catch(error => onStatus?.(error.message)); });
  return { close, ready: batch(), diagnostics, scopes };
}
