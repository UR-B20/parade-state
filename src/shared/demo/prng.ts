/** Deterministic PRNG (mulberry32) so demo data is identical on every run. */
export class Prng {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  next(): number {
    let t = (this.state += 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, maxInclusive: number): number {
    return min + Math.floor(this.next() * (maxInclusive - min + 1));
  }
  pick<T>(list: readonly T[]): T {
    const item = list[this.int(0, list.length - 1)];
    if (item === undefined) throw new Error('pick from empty list');
    return item;
  }
  shuffle<T>(list: readonly T[]): T[] {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const a = out[i]!;
      out[i] = out[j]!;
      out[j] = a;
    }
    return out;
  }
  /** RFC 4122 v4-shaped UUID from the stream (deterministic). */
  uuid(): string {
    const hex = () => this.int(0, 15).toString(16);
    let s = '';
    for (let i = 0; i < 32; i++) s += hex();
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-${((this.int(8, 11)).toString(16))}${s.slice(17, 20)}-${s.slice(20, 32)}`;
  }
}
