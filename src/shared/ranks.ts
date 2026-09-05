/**
 * Rank precedence for sorting rolls. Higher index = more senior.
 * Covers SAF enlistee, specialist, warrant officer, officer and military expert ranks.
 */
export const RANK_ORDER = [
  'REC', 'PTE', 'LCP', 'CPL', 'CFC',
  '3SG', '2SG', '1SG', 'SSG', 'MSG',
  '3WO', '2WO', '1WO', 'MWO', 'SWO', 'CWO',
  'ME1', 'ME2', 'ME3', 'ME4', 'ME5', 'ME6',
  'OCT', '2LT', 'LTA', 'CPT', 'MAJ', 'LTC', 'SLTC', 'COL',
] as const;

export type Rank = (typeof RANK_ORDER)[number];

const RANK_INDEX = new Map<string, number>(RANK_ORDER.map((r, i) => [r, i]));

export function isRank(value: string): value is Rank {
  return RANK_INDEX.has(value);
}

export function rankPrecedence(rank: string): number {
  return RANK_INDEX.get(rank) ?? -1;
}

/** Senior ranks first, then alphabetical by name. Stable for equal keys. */
export function compareByRankThenName(
  a: { rank: string; name: string },
  b: { rank: string; name: string },
): number {
  const byRank = rankPrecedence(b.rank) - rankPrecedence(a.rank);
  if (byRank !== 0) return byRank;
  return a.name.localeCompare(b.name, 'en');
}
