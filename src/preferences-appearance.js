/* SPDX-License-Identifier: GPL-3.0-or-later */
import { themeCSS } from './ui-theme.js';

export const preferencesCSS = `
  ${themeCSS('.dictionary-settings', true)}
  .dictionary-settings { color:var(--ink); font:14px/1.65 'Segoe UI','Microsoft YaHei','PingFang SC',sans-serif; max-width:800px; }
  .dictionary-settings * { box-sizing:border-box; }
  .dictionary-settings h2 { font-size:24px; font-weight:650; letter-spacing:-.02em; line-height:1.3; margin:0 0 8px; }
  .dictionary-settings h3 { font-size:16px; font-weight:600; line-height:1.4; margin:0 0 14px; }
  .dictionary-settings p { margin:8px 0; }
  .dictionary-settings .settings-intro { color:var(--muted); margin:0 0 24px; }
  .dictionary-settings .settings-section { display:block; padding-top:24px; margin-top:24px; border-top:1px solid var(--divider); }
  .dictionary-settings .settings-section > summary { font-size:16px; font-weight:600; cursor:pointer; }
  .dictionary-settings .settings-section[open] > summary { margin-bottom:16px; }
  .dictionary-settings .settings-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px 20px; }
  .dictionary-settings .settings-field { display:flex; flex-direction:column; align-items:stretch; gap:6px; min-width:0; font-size:13px; }
  .dictionary-settings .settings-field small { font-size:12px; color:var(--muted); }
  .dictionary-settings .settings-toggle { display:flex; align-items:flex-start; gap:10px; margin:12px 0; }
  .dictionary-settings input[type="checkbox"] { accent-color:var(--blue); width:16px; height:16px; margin:4px 0 0; flex:0 0 auto; }
  .dictionary-settings select, .dictionary-settings input[type="number"] { width:100%; max-width:100%; min-width:0; height:36px; padding:6px 9px; color:var(--ink); background:var(--surface); border:1px solid var(--control-border); border-radius:8px; font:13px/1.5 'Segoe UI','Microsoft YaHei',sans-serif; }
  .dictionary-settings button { min-height:34px; padding:6px 11px; color:var(--ink); background:var(--surface); border:1px solid var(--control-border); border-radius:8px; font:12px/1.5 'Segoe UI','Microsoft YaHei',sans-serif; white-space:nowrap; cursor:pointer; transition:background-color 120ms, border-color 120ms; }
  .dictionary-settings button:hover:not(:disabled) { background:var(--hover); border-color:var(--muted); }
  .dictionary-settings button:active:not(:disabled) { transform:translateY(1px); }
  .dictionary-settings button:disabled { background:var(--chrome); color:var(--disabled); cursor:default; }
  .dictionary-settings button.settings-primary { color:var(--accent-ink); background:var(--blue); border-color:var(--blue); }
  .dictionary-settings :is(button,input,select,summary,a):focus-visible { outline:2px solid var(--blue); outline-offset:3px; }
  .dictionary-settings .settings-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin:12px 0; }
  .dictionary-settings .settings-help { font-size:12px; color:var(--muted); line-height:1.75; }
  .dictionary-settings details.settings-help { margin:12px 0; }
  .dictionary-settings .settings-help > summary { cursor:pointer; width:fit-content; }
  .dictionary-settings .settings-path { color:var(--muted); font-size:12px; overflow-wrap:anywhere; }
  .dictionary-settings .settings-path:empty, .dictionary-settings [role="status"]:empty { display:none; }
  .dictionary-settings [role="status"] { font-size:12px; color:var(--blue); overflow-wrap:anywhere; }
  .dictionary-settings .settings-row { display:flex; align-items:center; gap:12px; padding:12px 0; margin:0; border-bottom:1px solid var(--divider); }
  .dictionary-settings .settings-row:last-child { border-bottom:0; }
  .dictionary-settings .settings-row-main { flex:1; min-width:0; overflow-wrap:anywhere; }
  .dictionary-settings .settings-row-actions { display:flex; gap:6px; align-items:center; flex:0 0 auto; }
  .dictionary-settings .settings-row small { display:block; color:var(--muted); font-size:12px; line-height:1.6; margin-top:2px; }
  .dictionary-settings .settings-row strong { font-weight:600; }
  .dictionary-settings .settings-empty { color:var(--muted); font-size:13px; padding:12px 0; }
  .dictionary-settings .settings-count { color:var(--muted); font-size:12px; }
  .dictionary-settings a { color:var(--blue); text-decoration:underline; text-underline-offset:3px; }
  .dictionary-settings .settings-danger { color:var(--error); }
  @media(max-width:600px) {
    .dictionary-settings .settings-grid { grid-template-columns:minmax(0,1fr); gap:14px; }
    .dictionary-settings h2 { font-size:21px; }
    .dictionary-settings .settings-row { gap:8px; flex-wrap:wrap; }
    .dictionary-settings .settings-row-main { flex-basis:100%; }
    .dictionary-settings .settings-row-actions { margin-left:auto; }
  }
  @media(prefers-reduced-motion:reduce) { .dictionary-settings button { transition:none; } .dictionary-settings button:active:not(:disabled) { transform:none; } }
`;
