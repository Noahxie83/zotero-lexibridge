import test from 'node:test';
import assert from 'node:assert/strict';
import { createCard } from '../src/render.js';

// These doubles provide only DOM geometry and dispatch; all drag/state behavior
// under test runs through the real card and position controller.
class Surface {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  dispatch(type, values = {}) {
    const event = { type, target: this, button: 0, isPrimary: true, pointerId: 7,
      clientX: 100, clientY: 100, preventDefault() { this.defaultPrevented = true; }, ...values };
    for (const fn of [...(this.listeners.get(type) || [])]) fn(event);
    return event;
  }
  listenerCount() { return [...this.listeners.values()].reduce((n, items) => n + items.size, 0); }
}

class Node extends Surface {
  constructor(tag) {
    super(); this.tagName = tag; this.children = []; this.style = {}; this.dataset = {};
    this.width = 300; this.height = 200; this.captures = new Set();
  }
  setAttribute(name, value) { this[name] = value; }
  append(...children) { this.children.push(...children); }
  attachShadow() { return this.shadowRoot = new Node('shadow'); }
  getBoundingClientRect() {
    return { left: Number.parseFloat(this.style.left) || 0, top: Number.parseFloat(this.style.top) || 0,
      width: this.width, height: this.height };
  }
  setPointerCapture(id) { this.captures.add(id); }
  releasePointerCapture(id) { this.captures.delete(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
}

function setup(options) {
  const win = new Surface(); win.innerWidth = 1000; win.innerHeight = 700;
  const doc = { defaultView: win, body: new Node('body'), documentElement: new Node('html'),
    createElementNS: (_ns, tag) => new Node(tag) };
  win.document = doc;
  const card = createCard(doc, 100, 100, 'word', () => {}, options);
  const header = card.host.shadowRoot.children[1].children[0];
  return { doc, win, card, header };
}

function drag(header, win, values = {}) {
  header.dispatch('pointerdown');
  win.dispatch('pointermove', { clientX: 140, clientY: 150, pageX: 9000, pageY: 8000, ...values });
  win.dispatch('pointerup');
}

test('blank header dragging uses iframe client coordinates and survives async positioning', () => {
  const { card, header, win } = setup();
  drag(header, win);
  assert.equal(card.host.style.left, '152px');
  assert.equal(card.host.style.top, '168px');
  card.host.height = 350;
  card.position();
  assert.equal(card.host.style.left, '152px');
  assert.equal(card.host.style.top, '168px');
  assert.deepEqual(card.positionState(), { mode: 'manual', left: 152, top: 168, x: 100, y: 100 });
});

test('title, controls, selected text and nonprimary presses cannot start a drag', () => {
  const { card, header, win } = setup();
  const targets = [...header.children, new Node('input')];
  for (const target of targets) {
    header.dispatch('pointerdown', { target });
    win.dispatch('pointermove', { clientX: 500, clientY: 500 });
    win.dispatch('pointerup');
  }
  for (const values of [{ button: 2 }, { isPrimary: false }]) {
    header.dispatch('pointerdown', values);
    win.dispatch('pointermove', { clientX: 500, clientY: 500 });
    win.dispatch('pointerup');
  }
  assert.equal(card.host.style.left, '112px');
  assert.equal(card.host.style.top, '118px');
  assert.equal(card.positionState().mode, 'auto');
});

test('manual snapshot restores across replacement cards and remains independent of pin state', () => {
  const original = setup();
  original.card.pinned = false;
  drag(original.header, original.win);
  const next = setup({ positionState: original.card.positionState() });
  next.card.pinned = true;
  assert.equal(next.card.host.style.left, '152px');
  drag(next.header, next.win);
  assert.equal(next.card.host.style.left, '192px');
  assert.equal(next.card.host.style.top, '218px');
});

test('restoring an automatic snapshot preserves its current location across content changes', () => {
  const previous = setup();
  previous.card.host.height = 700;
  previous.card.position();
  const next = setup({ positionState: previous.card.positionState() });
  assert.equal(next.card.positionState().mode, 'auto');
  assert.equal(next.card.host.style.top, '8px');
  next.card.host.height = 350;
  next.card.position();
  assert.equal(next.card.host.style.top, '8px');
});

test('resize clamps current coordinates and oversized content stays inside the minimum margin', () => {
  const { card, header, win } = setup();
  drag(header, win, { clientX: 700, clientY: 500 });
  win.innerWidth = 500; win.innerHeight = 400;
  win.dispatch('resize');
  assert.equal(card.host.style.left, '192px');
  assert.equal(card.host.style.top, '192px');
  win.innerWidth = 1000; win.innerHeight = 700;
  win.dispatch('resize');
  assert.equal(card.host.style.left, '192px');
  assert.equal(card.host.style.top, '192px');
  card.host.width = 1500; card.host.height = 900;
  card.position();
  assert.equal(card.host.style.left, '8px');
  assert.equal(card.host.style.top, '8px');
});

test('fresh automatic cards clamp async content growth without flipping back to the query anchor', () => {
  const { card, win } = setup();
  card.host.height = 600;
  card.position();
  assert.equal(card.host.style.top, '92px');
  card.host.height = 200;
  card.position({ clampOnly: true });
  assert.equal(card.host.style.top, '92px');
  card.position();
  assert.equal(card.host.style.top, '92px');
  win.innerHeight = 200;
  win.dispatch('resize');
  assert.equal(card.host.style.top, '8px');
});

test('pointer cancellation restores selection, releases capture and ignores further moves', () => {
  const { card, header, win, doc } = setup();
  doc.documentElement.style.userSelect = 'text';
  header.dispatch('pointerdown');
  assert.equal(doc.documentElement.style.userSelect, 'none');
  assert.equal(header.hasPointerCapture(7), true);
  win.dispatch('pointermove', { pointerId: 9, clientX: 500 });
  assert.equal(card.host.style.left, '112px');
  win.dispatch('pointercancel');
  assert.equal(doc.documentElement.style.userSelect, 'text');
  assert.equal(header.hasPointerCapture(7), false);
  win.dispatch('pointermove', { clientX: 500 });
  assert.equal(card.host.style.left, '112px');
});

test('window fallback still drags when pointer capture is unavailable or throws', () => {
  for (const capture of [undefined, () => { throw new Error('unsupported'); }]) {
    const { card, header, win } = setup();
    header.setPointerCapture = capture;
    drag(header, win);
    assert.equal(card.host.style.left, '152px');
  }
});

test('lost capture and window blur end a drag without changing the final manual coordinates', () => {
  for (const end of ['lostpointercapture', 'blur']) {
    const { card, header, win, doc } = setup();
    header.dispatch('pointerdown');
    win.dispatch('pointermove', { clientX: 140, clientY: 150 });
    (end === 'blur' ? win : header).dispatch(end);
    win.dispatch('pointermove', { clientX: 500, clientY: 500 });
    assert.equal(card.host.style.left, '152px');
    assert.notEqual(doc.documentElement.style.userSelect, 'none');
  }
});

test('cleanup composes callbacks despite exceptions and removes all active drag listeners', () => {
  const { card, header, win, doc } = setup();
  const called = [];
  card.addCleanup(() => { called.push('first'); throw new Error('broken external cleanup'); });
  card.addCleanup(() => called.push('second'));
  header.dispatch('pointerdown');
  header.releasePointerCapture = () => { throw new Error('already released'); };
  card.cleanup();
  card.cleanup();
  assert.deepEqual(called, ['first', 'second']);
  assert.notEqual(doc.documentElement.style.userSelect, 'none');
  assert.equal(win.listenerCount(), 0);
  assert.equal(header.listenerCount(), 0);
  header.dispatch('pointerdown');
  win.dispatch('pointermove', { clientX: 500 });
  assert.equal(card.host.style.left, '112px');
});

test('unload runs card cleanup and late registered cleanup executes immediately', () => {
  const { card, header, win, doc } = setup();
  let called = 0;
  card.addCleanup(() => { called++; });
  header.dispatch('pointerdown');
  win.dispatch('unload');
  card.addCleanup(() => { called++; });
  assert.equal(called, 2);
  assert.notEqual(doc.documentElement.style.userSelect, 'none');
  assert.equal(win.listenerCount(), 0);
});
