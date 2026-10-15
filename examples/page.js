/* SPDX-License-Identifier: GPL-3.0-or-later */
// Small page controls run independently of the real dictionary demo bundle.
(() => {
  const root = document.documentElement, button = document.getElementById('theme-toggle');
  const systemDark = window.matchMedia('(prefers-color-scheme:dark)');
  const theme = () => root.dataset.theme || (systemDark.matches ? 'dark' : 'light');
  function updateTheme() {
    const dark = theme() === 'dark';
    button.textContent = dark ? '浅色' : '深色';
    button.setAttribute('aria-label', dark ? '切换至浅色主题' : '切换至深色主题');
    window.dispatchEvent(new Event('local-dictionary-theme'));
  }
  button.addEventListener('click', () => { root.dataset.theme = theme() === 'dark' ? 'light' : 'dark'; updateTheme(); });
  const followSystem = () => { if (!root.dataset.theme) updateTheme(); };
  systemDark.addEventListener('change', followSystem);
  window.addEventListener('pagehide', () => systemDark.removeEventListener('change', followSystem));
  updateTheme();

  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion:reduce)').matches) {
    const reveal = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {entry.target.classList.remove('pending');reveal.unobserve(entry.target);}
    },{threshold:0.08});
    document.querySelectorAll('.reveal').forEach(section=>{section.classList.add('pending');reveal.observe(section)});
    window.addEventListener('pagehide',()=>reveal.disconnect());
  }
  const loader = document.getElementById('demo-loader');
  if (!loader) return; // Offline HTML already contains the complete demo.
  const target = document.getElementById('result');
  let pending, ready = false, observer;
  function loadDemo() {
    if (pending) return pending;
    observer?.disconnect(); target.textContent = '正在加载示例词典…'; target.setAttribute('aria-busy', 'true');
    pending = new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = loader.dataset.src;
      script.onload = () => { ready = true; target.removeAttribute('aria-busy'); resolve(); };
      script.onerror = () => {
        script.remove(); pending = null; target.removeAttribute('aria-busy');
        target.textContent = '示例词典加载失败，请检查连接。';
        const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '重新加载示例';
        retry.addEventListener('click', () => { void loadDemo().catch(() => {}); }); target.append(retry);
        reject(new Error('Demo script could not be loaded'));
      };
      document.head.append(script);
    });
    return pending;
  }
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void loadDemo().catch(() => {});
    });
    observer.observe(target);
  } else void loadDemo().catch(() => {});
  document.addEventListener('click', event => {
    const action = event.target.closest?.('[data-case],[data-word]');
    if (!action || ready) return;
    event.preventDefault(); event.stopImmediatePropagation();
    void loadDemo().then(() => action.click()).catch(() => {});
  }, true);
  window.addEventListener('pagehide', () => observer?.disconnect());
})();
