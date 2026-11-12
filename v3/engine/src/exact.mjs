// Only integers and decimal/fraction strings enter the exact calculation layer.
export class EngineError extends Error {
  constructor(code, detail) { super(`${code}: ${detail}`); this.name = 'EngineError'; this.code = code; }
}
export function requireThat(ok, code, detail) { if (!ok) throw new EngineError(code, detail); }
export const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a < 0n ? -a : a; };
export const lcm = (a, b) => a / gcd(a, b) * b;
export class Q {
  constructor(n, d = 1n) {
    requireThat(d !== 0n, 'INVALID_QUANTITY', 'zero denominator');
    if (d < 0n) { n = -n; d = -d; }
    const g = gcd(n, d); this.n = n / g; this.d = d / g;
  }
  static of(x) {
    if (x instanceof Q) return x;
    if (typeof x === 'number') requireThat(Number.isSafeInteger(x), 'INVALID_QUANTITY', 'use a string for fractions/decimals');
    requireThat(typeof x === 'string' || typeof x === 'number', 'INVALID_QUANTITY', 'integer or exact string required');
    const s = String(x);
    requireThat(s.length <= 128 && /^-?\d+(?:\.\d+|\/\d+)?$/.test(s), 'INVALID_QUANTITY', s);
    if (s.includes('/')) { const [n, d] = s.split('/'); return new Q(BigInt(n), BigInt(d)); }
    if (s.includes('.')) { const [n, f] = s.split('.'); return new Q(BigInt(n + f), 10n ** BigInt(f.length)); }
    return new Q(BigInt(s));
  }
  add(x) { x = Q.of(x); return new Q(this.n * x.d + x.n * this.d, this.d * x.d); }
  sub(x) { x = Q.of(x); return new Q(this.n * x.d - x.n * this.d, this.d * x.d); }
  mul(x) { x = Q.of(x); return new Q(this.n * x.n, this.d * x.d); }
  div(x) { x = Q.of(x); return new Q(this.n * x.d, this.d * x.n); }
  cmp(x) { x = Q.of(x); const n = this.n * x.d - x.n * this.d; return n < 0n ? -1 : n > 0n ? 1 : 0; }
  ceil() { return this.n >= 0n ? (this.n + this.d - 1n) / this.d : this.n / this.d; }
  toString() { return this.d === 1n ? `${this.n}` : `${this.n}/${this.d}`; }
  toJSON() { return this.toString(); }
}
export const minQ = (a, b) => Q.of(a).cmp(b) <= 0 ? Q.of(a) : Q.of(b);
export const maxQ = (a, b) => Q.of(a).cmp(b) >= 0 ? Q.of(a) : Q.of(b);
export function positive(x, at, zero = false) {
  const q = Q.of(x); requireThat(q.cmp(0) >= (zero ? 0 : 1), 'INVALID_QUANTITY', at); return q;
}
export function integer(x, at, zero = false) {
  requireThat(Number.isSafeInteger(x) && x >= (zero ? 0 : 1), 'INVALID_INTEGER', at); return x;
}
export function safeNumber(x, at) {
  const n = Number(x); requireThat(Number.isSafeInteger(n), 'RESOURCE_LIMIT', at); return n;
}
export function text(x, at) { requireThat(typeof x === 'string' && x.length > 0 && x.length <= 200 && !['__proto__','constructor','prototype'].includes(x), 'INVALID_ID', at); return x; }
export function unique(items, at) {
  requireThat(Array.isArray(items), 'INVALID_DATA', at);
  const ids = new Set();
  for (const item of items) { text(item?.id, at); requireThat(!ids.has(item.id), 'DUPLICATE_ID', `${at}/${item.id}`); ids.add(item.id); }
}
