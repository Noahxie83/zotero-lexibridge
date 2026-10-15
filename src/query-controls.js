/* SPDX-License-Identifier: GPL-3.0-or-later */
import { element } from './render.js';
export function shouldShowQueryDiagnostics(group) {
  return !!group && ['empty', 'error', 'cooldown'].includes(group.status);
}

export function queryControls(doc, current, { query, history, onQuery, onHistory, onPin, onCollect, onNote, onBrowse }) {
  const root = current.host.shadowRoot, card = root.querySelector('.card');
  const form = element(doc, 'form'); form.className = 'query-form';
  const input = element(doc, 'input'); input.type = 'search'; input.value = query.candidates.length ? (query.translationText ?? query.text) : '';
  input.maxLength = 256; input.placeholder = '输入单词或词组'; input.setAttribute('aria-label', '查询单词或词组');
  input.spellcheck = false;
  const field = element(doc, 'label'); field.className = 'query-field';
  const label = element(doc, 'span', '查询单词或词组'); label.className = 'query-label'; field.append(label, input);
  const submit = element(doc, 'button', '查询'); submit.type = 'submit'; form.append(field, submit);
  form.addEventListener('submit', event => { event.preventDefault(); if (input.value.trim()) onQuery(input.value); });
  const tools = element(doc, 'div'); tools.className = 'query-actions';
  const navigation = element(doc, 'div'); navigation.className = 'query-navigation';
  const saved = element(doc, 'div'); saved.className = 'action-group';
  const audio = element(doc, 'div'); audio.className = 'action-group'; tools.append(saved, audio);
  const action = (parent, label, handler, disabled = false) => {
    const button = element(doc, 'button', label); button.type = 'button'; button.disabled = disabled; button.addEventListener('click', handler); parent.append(button); return button;
  };
  action(navigation, '返回', () => onHistory(-1), !history.canBack); action(navigation, '前进', () => onHistory(1), !history.canForward);
  if (onBrowse) action(navigation, '浏览词目', () => onBrowse(input.value));
  const pin = action(navigation, current.pinned ? '取消固定' : '固定', () => {
    current.pinned = !current.pinned; pin.textContent = current.pinned ? '取消固定' : '固定'; pin.setAttribute('aria-pressed', String(current.pinned)); onPin?.(current.pinned);
  }); pin.className = 'pin-action'; pin.setAttribute('aria-pressed', String(current.pinned));
  if (onCollect) current.collectButton = action(saved, '收藏', onCollect, true);
  if (onNote) current.noteButton = action(saved, '写入笔记', onNote, true);
  current.audioButton = action(audio, '发音', () => current.playPreferred?.(), true);
  current.replayButton = action(audio, '重播', () => current.replay?.(), true);
  const details = element(doc, 'details'); details.className = 'query-diagnostics';
  details.hidden = true;
  const summary = element(doc, 'summary', '查询与资源诊断'); const diagnosticText = element(doc, 'pre'); details.append(summary, diagnosticText);
  current.setDiagnostics = failures => {
    const entries = (failures || []).filter(item => shouldShowQueryDiagnostics(item.group));
    details.hidden = entries.length === 0;
    summary.textContent = `查询与资源诊断（${entries.length} 个失败来源）`;
    diagnosticText.textContent = entries.map(({ name, group, text }) => `${name} · ${group.status}\n${text || (group.status === 'empty' ? '未找到结果。' : '查询未能完成。')}`).join('\n\n');
  };
  card.insertBefore(form, current.selectionTools); card.insertBefore(navigation, current.selectionTools);
  card.insertBefore(tools, current.footer); card.insertBefore(details, current.footer);
  current.queryInput = input;
}
