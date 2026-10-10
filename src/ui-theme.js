/* SPDX-License-Identifier: GPL-3.0-or-later */
// Shared chrome palette. Dictionary pages keep their own CSS in the sandbox.
// Radius scale: 12px for the popup, 8px for controls, 4px for small annotations.
const light = `
  color-scheme:light;
  --surface:#fbfcfd; --chrome:#f0f4f7; --border:#cbd5de; --control-border:#7d8d9b; --divider:#e0e6ec;
  --ink:#253440; --muted:#536575; --blue:#246a96; --accent-ink:#fbfcfd;
  --accent-soft:#e8f1f7; --hover:#e7edf2; --disabled:#73818d;
  --ribbon:#246a96; --definition:#253440; --uk:#536575; --us:#536575;
  --example:#415363; --grammar:#536575; --note:#f0f4f7;
  --error:#9a333b; --error-bg:#fcf0f1; --shadow:#233b5026;
`;
const dark = `
  color-scheme:dark;
  --surface:#222d36; --chrome:#1c2730; --border:#536371; --control-border:#738695; --divider:#3b4b58;
  --ink:#e6edf2; --muted:#adbdc9; --blue:#96c8e9; --accent-ink:#172c3a;
  --accent-soft:#2c4354; --hover:#344550; --disabled:#8797a4;
  --ribbon:#2a6388; --definition:#e6edf2; --uk:#adbdc9; --us:#adbdc9;
  --example:#c4d1da; --grammar:#adbdc9; --note:#2b3944;
  --error:#ffb6bd; --error-bg:#412e36; --shadow:#101c2a60;
`;
export function themeCSS(selector, documentTheme = false) {
  return `${selector}{${light}}
    @media(prefers-color-scheme:dark){${selector}:not([data-theme="light"]){${dark}}}
    ${selector}[data-theme="dark"]${documentTheme ? ',:root[data-theme="dark"] ' + selector : ''}{${dark}}
    ${documentTheme ? ':root[data-theme="light"] ' + selector + '{' + light + '}' : ''}`;
}
