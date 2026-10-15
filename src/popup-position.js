/* SPDX-License-Identifier: GPL-3.0-or-later */

// Coordinates belong to the reader iframe's viewport, just like position:fixed.
export function createPopupPosition({ host, header, win, x, y, state }) {
  const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
  const anchorX = finite(state?.x, finite(x, 0));
  const anchorY = finite(state?.y, finite(y, 0));
  const restored = (state?.mode === 'manual' || state?.mode === 'auto') &&
    Number.isFinite(state.left) && Number.isFinite(state.top);
  let mode = state?.mode === 'manual' && Number.isFinite(state.left) && Number.isFinite(state.top)
    ? 'manual' : 'auto';
  let left = finite(state?.left, anchorX + 12);
  let top = finite(state?.top, anchorY + 18);
  let positioned = restored;
  let disposed = false;
  let drag;
  const doc = host.ownerDocument || win.document;

  const clamp = () => {
    const rect = host.getBoundingClientRect();
    left = Math.max(8, Math.min(left, win.innerWidth - rect.width - 8));
    top = Math.max(8, Math.min(top, win.innerHeight - rect.height - 8));
    host.style.left = left + 'px';
    host.style.top = top + 'px';
  };
  const position = ({ clampOnly = false } = {}) => {
    if (disposed) return;
    if (!positioned && mode === 'auto' && !clampOnly) {
      const rect = host.getBoundingClientRect();
      left = anchorX + 12;
      top = anchorY + 18 + rect.height <= win.innerHeight - 8
        ? anchorY + 18 : anchorY - rect.height - 12;
    }
    clamp();
    positioned = true;
  };
  const suppress = event => {
    event.preventDefault?.();
    event.stopPropagation?.();
  };
  const preventSelection = event => { if (drag) event.preventDefault?.(); };
  const end = event => {
    if (!drag || (event?.pointerId != null && event.pointerId !== drag.pointerId)) return;
    const finished = drag;
    drag = undefined;
    win.removeEventListener('pointermove', move, true);
    win.removeEventListener('pointerup', end, true);
    win.removeEventListener('pointercancel', end, true);
    win.removeEventListener('blur', end, true);
    win.removeEventListener('selectstart', preventSelection, true);
    if (finished.selectionStyle) {
      const { selectionStyle, selectionValue, selectionPriority } = finished;
      if (selectionStyle.setProperty) {
        if (selectionValue) selectionStyle.setProperty('user-select', selectionValue, selectionPriority);
        else selectionStyle.removeProperty('user-select');
      } else selectionStyle.userSelect = selectionValue;
    }
    // Capture may already have been released by cancellation, DOM removal or
    // window teardown. Selection and listeners must still be restored.
    try { header.releasePointerCapture?.(finished.pointerId); } catch (_) { /* already released */ }
    if (event?.type === 'pointerup' || event?.type === 'pointercancel') suppress(event);
  };
  const move = event => {
    if (!drag || event.pointerId !== drag.pointerId ||
        !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
    left = drag.left + event.clientX - drag.x;
    top = drag.top + event.clientY - drag.y;
    mode = 'manual';
    clamp();
    suppress(event);
  };
  const start = event => {
    if (disposed || drag || event.target !== header || event.button !== 0 || event.isPrimary === false ||
        !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
    const selectionStyle = doc?.documentElement?.style;
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left, top,
      selectionStyle,
      selectionValue: selectionStyle?.getPropertyValue
        ? selectionStyle.getPropertyValue('user-select') : selectionStyle?.userSelect,
      selectionPriority: selectionStyle?.getPropertyPriority?.('user-select') || '' };
    if (selectionStyle?.setProperty) selectionStyle.setProperty('user-select', 'none', 'important');
    else if (selectionStyle) selectionStyle.userSelect = 'none';
    win.addEventListener('pointermove', move, true);
    win.addEventListener('pointerup', end, true);
    win.addEventListener('pointercancel', end, true);
    win.addEventListener('blur', end, true);
    win.addEventListener('selectstart', preventSelection, true);
    try { header.setPointerCapture?.(event.pointerId); } catch (_) { /* window listeners are the fallback */ }
    suppress(event);
  };
  const resize = () => position({ clampOnly: true });
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    end();
    header.removeEventListener('pointerdown', start);
    header.removeEventListener('lostpointercapture', end);
    win.removeEventListener('resize', resize);
    win.removeEventListener('unload', cleanup);
  };
  header.addEventListener('pointerdown', start);
  header.addEventListener('lostpointercapture', end);
  win.addEventListener('resize', resize);
  win.addEventListener('unload', cleanup);
  try { position(); } catch (error) { cleanup(); throw error; }
  return { position, snapshot: () => ({ mode, left, top, x: anchorX, y: anchorY }), cleanup };
}
