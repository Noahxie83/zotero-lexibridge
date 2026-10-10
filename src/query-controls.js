/* SPDX-License-Identifier: GPL-3.0-or-later */
import { element } from './render.js';
export function queryControls(doc, current, { query, history, onQuery, onHistory, onPin, onCollect, onNote, onBrowse }) {
  const root = current.host.shadowRoot, card = root.querySelector('.card');
  const form = element(doc, 'form'); form.className = 'query-form';
  const input = element(doc, 'input'); input.type = 'search'; input.value = query.candidates.length ? query.text : '';
  input.maxLength = 256; input.placeholder = '输入单词或词组'; input.setAttribute('aria-label', '查询单词或词组');
  const submit = element(doc, 'button', '查询'); submit.type = 'submit'; form.append(input, submit);
  form.addEventListener('submit', event => { event.preventDefault(); if (input.value.trim()) onQuery(input.value); });
  const tools = element(doc, 'div'); tools.className = 'query-actions';
  const action = (label, handler, disabled = false) => {
    const button = element(doc, 'button', label); button.type = 'button'; button.disabled = disabled; button.addEventListener('click', handler); tools.append(button); return button;
  };
  action('返回', () => onHistory(-1), !history.canBack); action('前进', () => onHistory(1), !history.canForward);
  if (onBrowse) action('浏览词目', () => onBrowse(input.value));
  const pin = action(current.pinned ? '取消固定' : '固定', () => {
    current.pinned = !current.pinned; pin.textContent = current.pinned ? '取消固定' : '固定'; pin.setAttribute('aria-pressed', String(current.pinned)); onPin?.(current.pinned);
  }); pin.setAttribute('aria-pressed', String(current.pinned));
  if (onCollect) current.collectButton = action('收藏', onCollect, true);
  if (onNote) current.noteButton = action('写入笔记', onNote, true);
  current.audioButton = action('发音', () => current.playPreferred?.(), true);
  current.replayButton = action('重播', () => current.replay?.(), true);
  const details = element(doc, 'details'); details.className = 'query-diagnostics';
  const summary = element(doc, 'summary', '查询与资源诊断'); const diagnosticText = element(doc, 'pre'); details.append(summary, diagnosticText);
  current.setDiagnostics = (issues, groups = [], sources = []) => {
    summary.textContent = issues.length ? `查询与资源诊断（${issues.length} 项提示）` : '查询与资源诊断';
    diagnosticText.textContent = groups.map(group => group.name + '：' + (group.stats?.format || 'MDX') + '，' + (group.stats?.entries || 0) + ' 个词目，' + group.results.length + ' 条命中，索引 ' + (group.stats?.indexMs ?? '未知') + ' ms').concat(sources, issues.length ? issues : ['暂无读取错误。']).join('\n');
  };
  card.insertBefore(form, current.choice); card.insertBefore(tools, current.choice); card.insertBefore(details, current.footer);
  current.queryInput = input;
}
