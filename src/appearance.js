/* SPDX-License-Identifier: GPL-3.0-or-later */

// Popup chrome and the optional text fallback. Original dictionary CSS is
// loaded only inside its own sandboxed iframe by native-render.js.
import { themeCSS } from './ui-theme.js';
export const popupCSS = `
  :host { color-scheme: light dark; }
  * { box-sizing: border-box; }
  [hidden] { display:none!important; }
  ${themeCSS('.card')}
  .card {
    width: min(540px, calc(100vw - 24px));
    max-height: min(580px, calc(100vh - 24px));
    display:flex; flex-direction:column; overflow:auto; scrollbar-width:thin;
    border: 1px solid var(--border); border-radius: 12px;
    background: var(--surface); color: var(--ink);
    box-shadow: 0 12px 36px var(--shadow), 0 2px 6px var(--shadow);
    font: 16px/1.65 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', sans-serif;
    text-align: left; user-select: text;
  }
  header {
    display:flex; gap:12px; align-items:center; flex:0 0 auto;
    min-height:36px; padding:6px 12px 4px 20px;
  }
  header h2 {
    flex:1; min-width:0; margin:0; color:var(--ink);
    font-size:13px; font-weight:600; line-height:1.4;
    overflow-wrap: anywhere;
  }
  button {
    min-height:32px; padding:5px 10px; flex:0 0 auto;
    border:1px solid var(--control-border); border-radius:8px; background:var(--surface);
    color:var(--ink); font:12px/1.5 'Segoe UI','Microsoft YaHei',sans-serif;
    cursor:pointer; white-space:nowrap; transition:background-color 120ms, border-color 120ms;
  }
  button:hover:not(:disabled) { background:var(--hover); border-color:var(--muted); }
  button:active:not(:disabled) { transform:translateY(1px); }
  button:disabled { color:var(--disabled); background:var(--chrome); cursor:default; }
  button[aria-pressed="true"] { background:var(--accent-soft); border-color:var(--blue); color:var(--blue); }
  button:focus-visible, input:focus-visible, select:focus-visible, summary:focus-visible, a:focus-visible { outline:2px solid var(--blue); outline-offset:3px; }
  header button { width:28px; min-height:28px; padding:0; border-color:transparent; background:transparent; color:var(--muted); font-size:22px; }
  .query-form { display:flex; gap:8px; align-items:flex-end; padding:2px 20px 10px; flex:0 0 auto; }
  .query-field { display:flex; flex-direction:column; gap:6px; min-width:0; flex:1; }
  .query-label { color:var(--muted); font-size:12px; line-height:1.4; }
  .query-form input { width:100%; min-width:0; height:38px; padding:7px 11px; color:var(--ink); background:var(--chrome); border:1px solid var(--control-border); border-radius:8px; font:14px/1.5 'Segoe UI','Microsoft YaHei',sans-serif; }
  .query-form input::placeholder { color:var(--muted); opacity:1; }
  .query-form button { height:38px; min-width:64px; background:var(--blue); border-color:var(--blue); color:var(--accent-ink); font-size:13px; font-weight:600; }
  .query-form button:hover { background:var(--blue); border-color:var(--blue); filter:brightness(.94); }
  .query-navigation { display:flex; gap:6px; padding:0 20px 8px; align-items:center; flex:0 0 auto; flex-wrap:wrap; }
  .query-navigation button { min-height:28px; padding:3px 8px; }
  .query-navigation .pin-action { margin-left:auto; }
  .query-actions { display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap; padding:8px 20px; border-top:1px solid var(--divider); background:var(--chrome); flex:0 0 auto; }
  .action-group { display:flex; gap:6px; flex-wrap:wrap; }
  .query-diagnostics { font-size:11px; padding:6px 20px; flex:0 0 auto; border-top:1px solid var(--divider); color:var(--muted); }
  .query-diagnostics summary { cursor:pointer; width:fit-content; }
  .query-diagnostics pre { white-space:pre-wrap; overflow-wrap:anywhere; max-height:120px; overflow:auto; margin:8px 0 2px; color:var(--ink); font:12px/1.6 'Segoe UI','Microsoft YaHei',sans-serif; }
  .result-section { margin-bottom:16px; }
  .load-more { display:block; margin:8px auto; max-width:100%; white-space:normal; overflow-wrap:anywhere; }
  .dictionary-choice {
    display: flex; align-items: center; gap: 9px;
    padding:10px 20px; border-top:1px solid var(--divider); border-bottom:1px solid var(--divider); background:var(--chrome); flex:0 0 auto;
  }
  .dictionary-label { color: var(--muted); font-size: 12px; flex: 0 0 auto; }
  .dictionary-choice[hidden], .body[hidden] { display: none; }
  select {
    flex: 1; min-width: 0; width: 100%; max-width: 100%;
    padding: 5px 8px; border: 1px solid var(--control-border); border-radius: 8px;
    background: var(--surface); color: var(--ink); font: inherit; font-size: 13px;
  }
  select:hover { border-color: var(--muted); }
  select:disabled { opacity: .6; cursor: default; }
  .query-alternatives {
    flex: 0 0 auto; padding: 8px 20px; border-bottom: 1px solid var(--divider);
    background: var(--note); color: var(--definition); font-size: 12px;
    line-height: 1.5; overflow-wrap: anywhere;
  }
  .query-alternatives[hidden] { display: none; }
  .selection-tools {
    padding: 10px 20px; background: var(--chrome); border-bottom: 1px solid var(--divider);
    display: flex; align-items: center; flex-wrap: wrap; gap: 8px 14px; flex: 0 0 auto;
  }
  .selection-tools[hidden] { display: none; }
  .annotation-colors, .annotation-actions { display: flex; align-items: center; gap: 6px; }
  .annotation-color {
    width:24px; min-height:24px; height:24px; padding:0; border:1px solid #0004; border-radius:4px;
    background: var(--annotation-color); box-shadow: inset 0 0 0 1px #ffffff30;
  }
  .annotation-color:hover:not(:disabled), .annotation-color[aria-pressed="true"] { background:var(--annotation-color); }
  .annotation-color[aria-pressed="true"] { outline: 2px solid var(--ink); outline-offset: 2px; }
  .annotation-actions button {
    padding:5px 9px;
  }
  .annotation-color:disabled { background:var(--annotation-color); opacity:.5; }
  .selection-tools small { color: var(--muted); font-size: 11px; }
  .query-match {
    padding: 8px 10px; margin-bottom: 12px; border-radius: 8px;
    background: var(--note); color: var(--muted); font-size: 12px; line-height: 1.5;
  }
  .body {
    min-height:70px; flex:1 1 auto; padding:20px; overflow:auto;
    overscroll-behavior: contain; scrollbar-width: thin;
    scrollbar-color: #aebbc9 transparent;
    overflow-wrap: anywhere; text-wrap: pretty;
  }
  .body[data-state="empty"], .body[data-state="loading"] { color:var(--muted); padding-block:28px; font-size:14px; line-height:1.8; }
  .body[data-state="error"] { color:var(--error); background:var(--error-bg); padding-block:24px; font-size:14px; }
  .body[data-state="loading"]::after { content:''; display:block; width:84%; height:48px; margin-top:16px; background:linear-gradient(var(--divider),var(--divider)) 0 0/100% 8px no-repeat,linear-gradient(var(--divider),var(--divider)) 0 20px/86% 8px no-repeat,linear-gradient(var(--divider),var(--divider)) 0 40px/64% 8px no-repeat; }
  .source {
    flex:0 0 auto; padding:6px 20px; border-top:1px solid var(--divider);
    color:var(--muted); font-size:11px; line-height:1.6;
    max-height:64px; overflow:auto; overflow-wrap:anywhere;
  }
  .body section + section { margin-top: 15px; padding-top: 13px; border-top: 1px solid var(--border); }
  .body p { margin: 5px 0; }
  .body h1, .body h2, .body h3, .body h4 { margin: 9px 0 5px; line-height: 1.3; }
  .body h1, .body h2 { font-size: 22px; color: var(--ink); }
  .body h3, .body h4 { font-size: 16px; }
  .body table { border-collapse: collapse; max-width: 100%; }
  .body td, .body th { padding: 3px 5px; }
  .body ul, .body ol { margin: 5px 0; padding-left: 1.4em; }
  .body li + li { margin-top: 5px; }
  .body li::marker { color: var(--definition); font-weight: 500; }
  .body hr { height: 1px; margin: 9px 0; border: 0; background: var(--border); }
  .dict-block { margin: 5px 0; }
  .dict-h-g, .dict-entry, .dict-entry-g, .dict-top-g, .dict-sn-gs,
  .dict-subentry-g, .dict-sn-blk, .dict-sn-blk-nolist { margin: 0; }
  .dict-top-g { margin-bottom: 7px; line-height: 1.65; }
  .body .dict-h, .body .dict-hw, .body .dict-headword, .body .dict-hwrap h2 {
    color:var(--ink); font-size:30px; font-weight:650; line-height:1.25; letter-spacing:-.02em;
    letter-spacing: .1px;
  }
  .dict-hwrap h2 { margin: 0 0 3px; }
  .dict-h { margin-right: 5px; }
  .dict-hkey { margin-right: 4px; }
  .dict-symbol { color: #ed714b; font-size: .8em; font-variant-emoji: text; }
  .dict-pron-gs { display: inline; }
  .dict-pron-g-blk {
    --pron-color: var(--uk); display: inline-block; margin: 0 5px;
    color: var(--pron-color); white-space: nowrap; vertical-align: baseline;
  }
  .dict-phon-blk { white-space: nowrap; }
  .dict-pron-g-blk:has(.dict-namelabel), .dict-audio-us { --pron-color: var(--us); }
  .dict-pron-g-blk:has(.dict-brelabel), .dict-audio-gb { --pron-color: var(--uk); }
  .dict-phon, .dict-phon-blk, .dict-pron, .dict-ipa {
    color: var(--pron-color, var(--uk)); font-family: 'Segoe UI', 'Lucida Sans Unicode', sans-serif;
    font-size:15px; font-weight:400; font-style:normal; letter-spacing:0;
  }
  .dict-brelabel, .dict-namelabel, .dict-pron-gs br { display: none; }
  .dict-pos-g { display:block; margin:18px 0 10px; border-bottom:1px solid var(--divider); line-height:1.3; }
  .dict-pos {
    display:inline-block; padding:0 0 8px; color:var(--muted);
    font-size:12px; font-weight:600; line-height:1.4; font-style:normal;
  }
  .dict-shcut-blk { display: block; margin: 10px 0 6px; }
  .dict-shcut {
    display: inline; padding: 2px 5px; background: var(--ribbon); color: #fff;
    font-size: 13px; font-weight: 700; line-height: 1.7; text-transform: uppercase;
    box-decoration-break: clone;
  }
  .dict-shcut .dict-chn { color: inherit; }
  .dict-sdsymb, .dict-xsymb { display: none; }
  .dict-sn-blk { margin: 7px 0 9px; }
  .dict-sn-blk > ol { margin: 0; }
  .dict-sn-g, .dict-licontent { display: inline; margin: 0; color: var(--definition); }
  .dict-gram-g, .dict-gram-blk { display: inline; margin: 0; color: var(--grammar); }
  .dict-label-g, .dict-label-g-blk, .dict-gl, .dict-gl-blk { color: var(--grammar); font-size: .93em; }
  .dict-def, .dict-definition { display: inline; color: var(--definition); }
  .dict-chn, .dict-cn, .dict-zh { color: var(--definition); font-style: normal; }
  .dict-cf, .dict-cl { font-weight: 600; }
  .dict-cf-blk { margin-right: .2em; }
  .dict-num, .dict-sn { color: var(--definition); font-weight: 600; margin-right: .3em; }
  .dict-x-gs { display: block; margin: 4px 0 6px; }
  .dict-x-g-blk, .dict-x-g { position: relative; display: block; margin: 4px 0; padding-left: 17px; }
  .dict-x-g-blk::before, .dict-x-g::before {
    content: '⇒'; position: absolute; left: 0; top: 1px; color: var(--blue);
    font: 13px/1.65 'Segoe UI', sans-serif;
  }
  .dict-x, .dict-example {
    color:var(--example); font:italic 15px/1.65 'Segoe UI','Microsoft YaHei',sans-serif;
  }
  .dict-x .dict-chn, .dict-example .dict-chn, .dict-example .dict-cn, .dict-example .dict-zh {
    display: block; margin-top: 1px; color: var(--example);
    font: normal 14px/1.65 'Microsoft YaHei', 'PingFang SC', 'Segoe UI', sans-serif;
  }
  .dict-x br:has(+ .dict-chn), .dict-example br:has(+ .dict-chn) { display: none; }
  .dict-unbox, .dict-note-g {
    padding: 8px 10px; margin: 9px 0; background: var(--note); border-radius: 4px;
  }
  .dict-unbox h2, .dict-unbox h3 { font-size: 15px; }
  .dict-xr-gs { display: block; margin: 6px 0; font-size: 14px; color: var(--muted); }
  .dict-xrlabel { margin-right: 5px; }
  .dict-xr-gs .dict-xr-g-blk, .dict-xr-gs .dict-xr-g, .dict-xr-gs .dict-xh-blk {
    display: inline; margin: 0; padding: 0;
  }
  .dict-xr-gs .dict-xr-g { white-space: nowrap; }
  .dict-vp-gs {
    display: block; margin: 11px 0 15px; padding: 8px 11px 3px;
    background: var(--note); border-radius: 4px;
  }
  .dict-vp-gs::before {
    content: '词形与发音'; display: block; margin-bottom: 3px;
    color: var(--muted); font-size: 12px; font-weight: 600;
  }
  .dict-form-row {
    display: grid; grid-template-columns: minmax(90px, 30%) minmax(0, 1fr);
    align-items: start; gap: 6px 12px; margin: 0; padding: 7px 0;
    border-top: 1px solid var(--border);
  }
  .dict-vpform {
    display: block; margin: 0; padding-top: 1px; color: var(--muted);
    font-size: 12px; font-style: normal; line-height: 1.45;
  }
  .dict-form-row > .dict-vp-g { display: block; min-width: 0; margin: 0; }
  .dict-form-row > .dict-vp-g:only-child { grid-column: 1 / -1; }
  .dict-vp-g > .dict-vp {
    display: block; margin-bottom: 2px; color: var(--definition);
    font-size: 15px; font-weight: 600; line-height: 1.4;
  }
  .dict-vp-g > .dict-pron-gs, .dict-vp-g > .dict-pron {
    display: flex; flex-wrap: wrap; gap: 2px 10px; font: inherit;
  }
  .dict-vp-g .dict-pron-g-blk { margin: 0; }
  .dict-vp-g .dict-phon, .dict-vp-g .dict-phon-blk { font-size: 14px; line-height: 1.5; }
  .dict-xh, .dict-idm, .dict-pv { color: var(--definition); font-weight: 600; }
  .dict-boxtag, .dict-word-frequency .dict-label {
    display: inline-block; margin: 2px 4px 2px 0; padding: 1px 5px;
    background: var(--note); color: var(--definition); border-radius: 4px; font-size: 11px;
  }
  .dict-dcb { margin: 8px 0; line-height: 1.65; }
  .dict-dcb .dict-pos { margin-right: 8px; }
  .dict-dcn { color: var(--definition); }
  @media (max-width: 420px) {
    header { padding-left:14px; }
    .query-form { padding-inline:14px; }
    .query-navigation, .query-actions, .dictionary-choice, .selection-tools, .query-diagnostics, .source { padding-inline:14px; }
    .query-actions { gap:8px 12px; }
    .body { padding:18px 14px; }
    .body .dict-h, .body .dict-hw, .body .dict-headword, .body .dict-hwrap h2 { font-size:26px; }
    .dict-pron-g-blk { margin-left: 0; margin-right: 8px; }
    .dict-form-row { grid-template-columns: minmax(85px, 30%) minmax(0, 1fr); column-gap: 8px; }
    .dict-vp-g .dict-pron-g-blk { margin: 0; }
  }
  @media (prefers-reduced-motion:reduce) { button { transition:none; } button:active:not(:disabled) { transform:none; } }
`;
