/* SPDX-License-Identifier: GPL-3.0-or-later */
import { ResourceCancelledError } from './resources.js';

// Active popups lease their sources. Only a bounded number of idle sources
// survive, so eviction never interrupts a popup's subsequent audio requests.
export class ResourcePool {
  constructor(open, capacity = 3) { this.open = open; this.capacity = capacity; this.entries = new Map(); }
  entry(path) {
    let entry = this.entries.get(path);
    if (!entry) {
      entry = { refs: 0, closed: false };
      entry.promise = Promise.resolve().then(() => this.open(path)).then(resources => {
        if (entry.closed) { resources.close(); throw new ResourceCancelledError(); }
        entry.resources = resources; this.trim(); return resources;
      }, error => { if (this.entries.get(path) === entry) this.entries.delete(path); throw error; });
    }
    this.entries.delete(path); this.entries.set(path, entry);
    return entry;
  }
  load(path) { return this.entry(path).promise; }
  async acquire(path) {
    const entry = this.entry(path); entry.refs++;
    let released = false;
    const release = () => { if (!released) { released = true; entry.refs--; this.trim(); } };
    try { return { resources: await entry.promise, release }; } catch (error) { release(); throw error; }
  }
  evict(path, entry) {
    this.entries.delete(path); entry.closed = true;
    entry.promise.then(resources => resources.close()).catch(() => {});
  }
  trim() {
    const idle = [...this.entries].filter(([, entry]) => !entry.refs);
    for (const [path, entry] of idle.slice(0, Math.max(0, idle.length - this.capacity))) this.evict(path, entry);
  }
  clear() { for (const [path, entry] of this.entries) this.evict(path, entry); }
}
