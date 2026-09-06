import badge from '../brand/soldiertrack-badge.svg';

/**
 * The SoldierTrack badge (olive roundel with the crossed rounds). Its white wings vanish on a
 * white ground on purpose; the roundel itself reads on light and dark.
 */
export function BrandMark({ size = 22 }: { size?: number }) {
  return <img src={badge} alt="" width={Math.round(size * 1.236)} height={size} draggable={false} style={{ display: 'block' }} />;
}
