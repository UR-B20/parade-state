import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { appSettings, dateUnlocks } from '../db/schema';
import { demoControlsEnabled, type Bindings } from '../env';
import { sgDateOf, type IsoDate } from '@shared/dates';
import type { SettingsDto } from '@shared/types';

export interface Settings {
  cutoffAm: string;
  cutoffPm: string;
  demoNow: string | null;
}

export async function getSettings(db: Db): Promise<Settings> {
  const rows = await db.select().from(appSettings);
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { cutoffAm: map['cutoff_am'] ?? '10:00', cutoffPm: map['cutoff_pm'] ?? '14:00', demoNow: map['demo_now'] ?? null };
}

export async function setSetting(db: Db, key: string, value: string | null): Promise<void> {
  if (value === null) {
    await db.delete(appSettings).where(eq(appSettings.key, key));
  } else {
    await db.insert(appSettings).values({ key, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } });
  }
}

/** Effective "now": the demo clock when demo controls are on and a clock is set, else real time. */
export async function resolveNow(db: Db, env: Bindings, realNow: Date): Promise<{ now: Date; demoNow: string | null; settings: Settings }> {
  const settings = await getSettings(db);
  const demoNow = demoControlsEnabled(env) ? settings.demoNow : null;
  return { now: demoNow ? new Date(demoNow) : realNow, demoNow, settings };
}

export async function listUnlocks(db: Db, realNow: Date): Promise<SettingsDto['dateUnlocks']> {
  const rows = await db.select().from(dateUnlocks);
  return rows
    .filter((r) => r.expiresAt.getTime() > realNow.getTime())
    .map((r) => ({ date: r.date, unlockedBy: r.unlockedBy, expiresAt: r.expiresAt.toISOString() }));
}

export async function settingsDto(db: Db, realNow: Date): Promise<SettingsDto> {
  const s = await getSettings(db);
  return { cutoffAm: s.cutoffAm, cutoffPm: s.cutoffPm, dateUnlocks: await listUnlocks(db, realNow) };
}

export async function isLockedForCommander(db: Db, eventDate: IsoDate, now: Date): Promise<boolean> {
  const today = sgDateOf(now);
  if (eventDate >= today) return false;
  const unlocks = await listUnlocks(db, now);
  return !unlocks.some((u) => u.date === eventDate);
}
