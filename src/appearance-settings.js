/* SPDX-License-Identifier: GPL-3.0-or-later */
const bounded = (value, fallback, min, max) => value != null && value !== '' && Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
export function appearanceSettings(get) {
  return { fontSize: bounded(get('fontSize'), 16, 12, 28), width: bounded(get('popupWidth'), 540, 320, 1000), height: bounded(get('popupHeight'), 580, 240, 1000),
    theme: ['original', 'light', 'dark'].includes(get('theme')) ? get('theme') : 'original' };
}
export function applyAppearance(current, appearance) {
  const card = current.host.shadowRoot.querySelector('.card');
  card.style.width = `min(${appearance.width}px, calc(100vw - 24px))`;
  card.style.maxHeight = `min(${appearance.height}px, calc(100vh - 24px))`;
  card.style.fontSize = appearance.fontSize + 'px';
  // CSS owns the complete palette so switching themes never leaves stale colors.
  card.dataset.theme = appearance.theme;
}
export function nativeAppearanceCSS(appearance = {}) {
  const size = bounded(appearance.fontSize, 16, 12, 28);
  let css = size === 16 && (!appearance.theme || appearance.theme === 'original') ? '' : `body{font-size:${size}px!important}`;
  if (appearance.theme === 'dark') css += 'html,body{color-scheme:dark;background:#20252b!important;color:#e5eaf0!important}body *:not(img):not(video):not(canvas){background-color:transparent!important;color:inherit!important}a{color:#80c5ff!important}';
  else if (appearance.theme === 'light') css += 'html,body{color-scheme:light;background:white!important;color:#222!important}';
  return css;
}
export function preferredAudio(keys, preference = 'first') {
  const pattern = preference === 'us' ? /(?:^|[\/_.\s-])(?:us|am|nam|american)(?:[\/_.\s-]|$)/i : /(?:^|[\/_.\s-])(?:gb|uk|br|bre|british)(?:[\/_.\s-]|$)/i;
  return preference === 'first' ? keys[0] : keys.find(key => pattern.test(key)) || keys[0];
}
