/* SPDX-License-Identifier: GPL-3.0-or-later */
import { defaultOnlineSource, ONLINE_ENGINE_IDS } from '../src/online-engine-catalog.js';
import { createCard, renderDefinition, element } from '../src/render.js';
import { queryControls } from '../src/query-controls.js';
import { queryFromText } from '../src/selection-query.js';
import { applyAppearance } from '../src/appearance-settings.js';
import { mountEnhancements } from '../src/preferences-panel.js';
import { renderSelectionTools } from '../src/selection-menu.js';

const preferences = new Map([['theme', 'light'], ['path', '/dictionaries/English.mdx'], ['resources', '{}']]);
const dictionaries = [{ name: 'English Learner', path: '/dictionaries/English.mdx' },
  { name: '英汉简明词典', path: '/dictionaries/Chinese.ifo' }, { name: 'Academic English', path: '/dictionaries/Academic.dsl' }];
let previewSources = [...dictionaries.map((d,i)=>({id:'local:preview:'+i,kind:'local',path:d.path,name:d.name,enabled:true})), ...ONLINE_ENGINE_IDS.map(defaultOnlineSource)];
const folders = ['/dictionaries'];
const records = [{ id: 'sample', word: 'network', definition: '网络；相互连接的系统', context: { title: '阅读示例', pageIndex: 3 } }];
const entries = {
  research: '<div class="entry"><h2 class="headword">research</h2><p class="phon">/rɪˈsɜːtʃ/</p><div class="pos-g"><span class="pos">noun</span></div><ol><li><span class="def">a careful study of a subject to discover new facts</span><div class="chn">研究；调查</div><div class="x-g"><span class="x">The results of the research were published.<br><span class="chn">研究结果已经发表。</span></span></div></li></ol><div class="pos-g"><span class="pos">verb</span></div><p class="def">to study something carefully and in detail</p><p class="chn">研究；探讨</p></div>',
  network: '<h2 class="headword">network</h2><p class="phon">/ˈnetwɜːk/</p><div class="pos-g"><span class="pos">noun</span></div><p class="def">a group of connected people or things</p><p class="chn">网络；相互连接的系统</p><div class="x-g"><span class="x">The network connects researchers across the world.<br><span class="chn">这个网络将世界各地的研究者联系起来。</span></span></div>',
  'neural network': '<h2 class="headword">neural network</h2><div class="pos-g"><span class="pos">noun</span></div><p class="def">a computing system with interconnected processing units</p><p class="chn">神经网络</p>'
};
let current, pinned = false, history = ['research'], cursor = 0, refreshSettings;
const notice = text => { document.getElementById('preview-notice').textContent = text; };
function show(word = history[cursor], add = false) {
  if (add) { history = history.slice(0, cursor + 1); history.push(word); cursor++; }
  current?.host.remove();
  current = createCard(document, 0, 0, word, () => current.host.remove());
  const card = current;
  card.host.style.cssText = 'all:initial;display:block;position:relative;width:100%;';
  document.getElementById('popup-preview').append(card.host);
  card.pinned = pinned;
  applyAppearance(card, { theme: preferences.get('theme'), fontSize: Number(preferences.get('fontSize')) || 16,
    width: Number(preferences.get('popupWidth')) || 540, height: Number(preferences.get('popupHeight')) || 580 });
  card.host.shadowRoot.querySelector('.card').style.maxWidth = '100%';
  for (const dictionary of dictionaries) { const option = element(document, 'option', dictionary.name); option.value = dictionary.path; card.selector.append(option); }
  card.selector.value = preferences.get('path');
  card.selector.addEventListener('change', () => { preferences.set('path', card.selector.value); show(word); });
  queryControls(document, card, {
    query: queryFromText(word), history: { canBack: cursor > 0, canForward: cursor < history.length - 1 },
    onQuery: text => show(text.trim().toLowerCase(), true),
    onHistory: delta => { cursor += delta; show(); }, onPin: value => { pinned = value; },
    onCollect: () => {
      if (!records.some(record => record.word === word)) records.push({ id: word, word, definition: card.body.textContent, context: { title: '界面预览', pageIndex: 0 } });
      card.collectButton.textContent = '已收藏'; card.footer.textContent = '已加入预览中的生词记录'; refreshSettings();
    },
    onNote: () => { card.noteButton.textContent = '已写入笔记'; card.footer.textContent = '此预览仅演示笔记状态；未写入 Zotero'; },
    onBrowse: prefix => {
      card.setState?.('ready'); card.body.replaceChildren();
      for (const value of Object.keys(entries).filter(value => value.startsWith(prefix.trim()))) {
        const button = element(document, 'button', value); button.type = 'button'; button.className = 'load-more';
        button.addEventListener('click', () => show(value, true)); card.body.append(button);
      }
      if (!card.body.childNodes.length) { card.setState?.('empty'); card.body.textContent = '示例词典中没有该前缀。清空输入后再次浏览词目。'; }
      card.footer.textContent = '示例词典词目';
    }
  });
  const state = document.getElementById('preview-state').value;
  if (state === 'loading') { card.setState?.('loading'); card.body.textContent = '正在查询本地词典…'; }
  else if (state === 'error') { card.setState?.('error'); card.body.textContent = '词典读取失败。请在设置中检查文件路径，再刷新词典列表。'; }
  else if (state === 'empty' || !entries[word]) { card.setState?.('empty'); card.body.textContent = `未找到“${word}”。可修改查询词或切换词典。`; }
  else {
    card.setState?.('ready'); card.body.replaceChildren(renderDefinition(document, entries[word]));
    card.collectButton.disabled = false; card.noteButton.disabled = false;
    card.audioButton.disabled = false;
    card.playPreferred = () => {
      const audio = new AudioContext(), oscillator = audio.createOscillator(), gain = audio.createGain();
      gain.gain.value = 0.04; oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + 0.12);
      oscillator.onended = () => audio.close(); card.replayButton.disabled = false; card.footer.textContent = '已播放自制提示音';
    };
    card.replay = () => card.playPreferred();
  }
  if (state === 'selection') renderSelectionTools(document, card.selectionTools, { color: '#ffd400', setColor() {},
    add: async () => {}, onStatus: text => { card.footer.textContent = text + '（预览）'; } });
  card.footer.textContent = 'English Learner · 自制示例词条';
  const ready = (state === 'ready' || state === 'selection') && !!entries[word];
  card.setDiagnostics(state === 'error' || state === 'empty' ? [{name:'English Learner',group:{status:state === 'error'?'error':'empty'},text:state === 'error'?'示例：词典文件读取失败。':'示例：未找到词条。'}] : []);
}
refreshSettings = mountEnhancements(window, {
  get: key => preferences.get(key), set: (key, value) => { preferences.set(key, value); if (key === 'theme') setTheme(value); else show(); },
  vocabulary: { list: () => records, remove: id => { const index = records.findIndex(record => record.id === id); if (index >= 0) records.splice(index, 1); } },
  sources:()=>previewSources, onSources: next=>{previewSources=next;refreshSettings();},
  dictionaries: () => dictionaries.slice(), folders: () => folders.slice(),
  onFolders: () => { if (!folders.includes('/additional-dictionaries')) folders.push('/additional-dictionaries'); },
  onRemoveFolder: path => { folders.splice(folders.indexOf(path), 1); }, onRefresh: () => notice('预览目录列表已刷新。'),
  onOrder: (index, delta) => { const target = index + delta; if (target >= 0 && target < dictionaries.length) [dictionaries[index], dictionaries[target]] = [dictionaries[target], dictionaries[index]]; },
  onResourceOrder: () => {}, onExport: format => notice(`预览包含 ${records.length} 条记录；实际插件可导出 ${format === 'csv' ? 'CSV' : 'Anki TSV'}。`),
  onBackup: () => notice('实际插件会保存设置与生词备份。此预览不访问本机词典文件。'),
  onImport: () => notice('实际插件可选择备份文件。此预览不访问本机词典文件。')
});
function setTheme(theme) {
  preferences.set('theme', theme); document.documentElement.dataset.theme = theme;
  document.getElementById('preview-theme').value = theme; refreshSettings(); show();
}
for (const [id, text] of [['local-mdx-folder', '词典目录：/dictionaries'], ['local-mdx-path', '当前文件：/dictionaries/English.mdx'], ['local-mdx-status', '已找到 3 部示例词典。']]) document.getElementById(id).textContent = text;
document.getElementById('local-mdx-enabled').checked = true;
document.getElementById('local-mdx-click-enabled').checked = true;
document.getElementById('local-mdx-selection-enabled').checked = true;
for (const dictionary of dictionaries) { const option = element(document, 'option', dictionary.name); option.value = dictionary.path; document.getElementById('local-mdx-select').append(option); }
document.getElementById('local-mdx-select').onchange = event => { preferences.set('path', event.target.value); refreshSettings(); show(); };
document.getElementById('settings-preview').addEventListener('click', event => {
  if (event.target.id?.startsWith('local-mdx-') && event.target.tagName === 'BUTTON') notice('此按钮在 Zotero 中打开本地文件选择窗口。');
});
document.getElementById('preview-view').onchange = event => {
  const settings = event.target.value === 'settings';
  document.getElementById('settings-preview').hidden = !settings; document.getElementById('popup-preview').hidden = settings;
  document.getElementById('preview-state-label').hidden = settings; document.getElementById('preview-reopen').hidden = settings;
};
document.getElementById('preview-theme').onchange = event => setTheme(event.target.value);
document.getElementById('preview-state').onchange = () => show();
document.getElementById('preview-reopen').onclick = () => show();
setTheme('light');
