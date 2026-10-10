/* SPDX-License-Identifier: GPL-3.0-or-later */
export class QueryHistory {
  constructor(limit = 40) { this.limit = limit; this.entries = []; this.index = -1; }
  add(entry) {
    const snapshot = JSON.parse(JSON.stringify(entry));
    const previous = this.entries[this.index];
    if (previous && JSON.stringify(previous) === JSON.stringify(snapshot)) return;
    this.entries.splice(this.index + 1); this.entries.push(snapshot);
    if (this.entries.length > this.limit) this.entries.shift(); this.index = this.entries.length - 1;
  }
  get canBack() { return this.index > 0; }
  get canForward() { return this.index + 1 < this.entries.length; }
  move(delta) {
    const index = this.index + delta;
    if (index < 0 || index >= this.entries.length) return null;
    this.index = index; return JSON.parse(JSON.stringify(this.entries[index]));
  }
}
