/**
 * Writes that must not be lost when the signal drops. Every mark and submit goes through here:
 * it is stored in IndexedDB first, then replayed in order as soon as the server answers.
 * A server rejection (validation, locked date, conflict) drops the item and reports it; a
 * network failure keeps it for the next attempt.
 */
import { del, get, set } from 'idb-keyval';
import type { MarkBody, MarkResultDto, SubmitBody, SubmitResultDto } from '@shared/types';
import { ApiError, isNetworkError, type Api } from '../api/client';

export type QueuedOp = { id: string; createdAt: string; unitId: string; eventId: string } & (
  | { kind: 'mark'; personId: string; body: MarkBody }
  | { kind: 'submit'; body: SubmitBody }
);

/** A queued operation before it is given an id and timestamp. */
export type NewOp = QueuedOp extends infer T ? (T extends QueuedOp ? Omit<T, 'id' | 'createdAt'> : never) : never;

export type OpResult = { kind: 'mark'; op: Extract<QueuedOp, { kind: 'mark' }>; result: MarkResultDto } | { kind: 'submit'; op: Extract<QueuedOp, { kind: 'submit' }>; result: SubmitResultDto };

export interface QueueHandlers {
  onApplied(result: OpResult): void;
  onRejected(op: QueuedOp, error: ApiError): void;
}

const STORAGE_KEY = 'parade-state:queue';

export class OfflineQueue {
  private items: QueuedOp[] = [];
  private listeners = new Set<() => void>();
  private replaying: Promise<void> | null = null;
  private loaded: Promise<void>;

  constructor(
    private readonly api: Api,
    private readonly handlers: QueueHandlers,
  ) {
    this.loaded = get<QueuedOp[]>(STORAGE_KEY)
      .then((items) => {
        if (items) this.items = items;
      })
      .catch(() => undefined)
      .then(() => this.notify());
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => void this.replay());
      window.addEventListener('parade-state:online', () => void this.replay());
    }
  }

  get pending(): readonly QueuedOp[] {
    return this.items;
  }

  get size(): number {
    return this.items.length;
  }

  /** Items waiting for a unit and event. */
  pendingFor(unitId: string, eventId: string): QueuedOp[] {
    return this.items.filter((i) => i.unitId === unitId && i.eventId === eventId);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async ready(): Promise<void> {
    await this.loaded;
  }

  async enqueue(op: NewOp): Promise<void> {
    await this.loaded;
    const item = { ...op, id: crypto.randomUUID(), createdAt: new Date().toISOString() } as QueuedOp;
    // A newer mark for the same person replaces an older unsent one.
    if (item.kind === 'mark') {
      this.items = this.items.filter((i) => !(i.kind === 'mark' && i.unitId === item.unitId && i.eventId === item.eventId && i.personId === item.personId));
    }
    this.items.push(item);
    await this.persist();
    void this.replay();
  }

  /** Send everything in order until the queue is empty or the network fails. */
  replay(): Promise<void> {
    if (this.replaying) return this.replaying;
    this.replaying = this.drain().finally(() => {
      this.replaying = null;
    });
    return this.replaying;
  }

  async clear(): Promise<void> {
    this.items = [];
    await this.persist();
  }

  private async drain(): Promise<void> {
    await this.loaded;
    while (this.items.length > 0) {
      const op = this.items[0]!;
      try {
        if (op.kind === 'mark') {
          const result = await this.api.mark(op.unitId, op.eventId, op.personId, op.body);
          this.items = this.items.filter((i) => i.id !== op.id);
          await this.persist();
          this.handlers.onApplied({ kind: 'mark', op, result });
        } else {
          const result = await this.api.submit(op.unitId, op.eventId, op.body);
          this.items = this.items.filter((i) => i.id !== op.id);
          await this.persist();
          this.handlers.onApplied({ kind: 'submit', op, result });
        }
      } catch (err) {
        if (isNetworkError(err)) return;
        if (err instanceof ApiError) {
          this.items = this.items.filter((i) => i.id !== op.id);
          await this.persist();
          this.handlers.onRejected(op, err);
          continue;
        }
        throw err;
      }
    }
  }

  private async persist(): Promise<void> {
    try {
      if (this.items.length === 0) await del(STORAGE_KEY);
      else await set(STORAGE_KEY, this.items);
    } catch (err) {
      console.error('Could not persist the offline queue', err);
    }
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }
}
