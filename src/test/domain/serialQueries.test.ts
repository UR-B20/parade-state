import { describe, expect, it } from 'vitest';
import { serialQueries } from '../../worker/db/client';

/** A stand-in for postgres.js: `unsafe` returns a thenable with `.values()`, and records overlap. */
function fakeClient(delay = 15) {
  let inFlight = 0;
  let maxInFlight = 0;
  const log: string[] = [];
  const client = {
    options: { parsers: {}, serializers: {} },
    unsafe(query: string) {
      let values = false;
      const p = {
        values() { values = true; return p; },
        then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          return new Promise((resolve) => setTimeout(resolve, delay)).then(() => { inFlight -= 1; log.push(query); return values ? [[query]] : [{ query }]; }).then(res, rej);
        },
      };
      return p;
    },
    begin(fn: (tx: unknown) => Promise<unknown>) {
      log.push('BEGIN');
      return fn(client).then((r) => { log.push('COMMIT'); return r; });
    },
  };
  return { client, log, stats: () => ({ maxInFlight }) };
}

describe('serialQueries', () => {
  it('runs concurrent queries one at a time, in call order, keeping .values()', async () => {
    const fake = fakeClient();
    const c = serialQueries(fake.client) as unknown as typeof fake.client;
    const results = await Promise.all([c.unsafe('a').values(), c.unsafe('b'), c.unsafe('c').values()]);
    expect(fake.stats().maxInFlight).toBe(1);
    expect(fake.log).toEqual(['a', 'b', 'c']);
    expect(results).toEqual([[['a']], [{ query: 'b' }], [['c']]]);
  });

  it('serialises inside a transaction and keeps later queries behind it', async () => {
    const fake = fakeClient();
    const c = serialQueries(fake.client) as unknown as typeof fake.client;
    const tx = c.begin(async (t) => {
      const txc = t as typeof fake.client;
      await Promise.all([txc.unsafe('t1'), txc.unsafe('t2')]);
      return 'done';
    });
    const after = c.unsafe('after');
    expect(await tx).toBe('done');
    await after;
    expect(fake.stats().maxInFlight).toBe(1);
    expect(fake.log).toEqual(['BEGIN', 't1', 't2', 'COMMIT', 'after']);
  });

  it('keeps passing through other members and survives a failed query', async () => {
    const fake = fakeClient();
    fake.client.unsafe = ((query: string) => ({ values() { return this; }, then(_r: unknown, rej: (e: unknown) => unknown) { return Promise.reject(new Error(query)).then(undefined, rej); } })) as never;
    const c = serialQueries(fake.client) as unknown as typeof fake.client;
    expect(c.options).toBe(fake.client.options);
    await expect(c.unsafe('boom')).rejects.toThrow('boom');
    await expect(c.unsafe('again')).rejects.toThrow('again');
  });
});

describe('serialQueries timeout', () => {
  it('turns a query that never answers into an error naming the statement', async () => {
    const client = { unsafe: (_q: string) => ({ values() { return this; }, then() { /* never settles */ } }) };
    const c = serialQueries(client, 30) as unknown as typeof client;
    await expect(c.unsafe('select pg_sleep(60)') as unknown as Promise<unknown>).rejects.toThrow(/timed out after 30 ms: select pg_sleep\(60\)/);
  });
});
