import type { CSSProperties } from 'react';
import './Feedback.css';

export function Skeleton({ width, height = 14, radius, style }: { width?: number | string; height?: number; radius?: number; style?: CSSProperties }) {
  return <span className="skeleton" style={{ display: 'block', width: width ?? '100%', height, borderRadius: radius, ...style }} aria-hidden="true" />;
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="roll" aria-busy="true" aria-label="Loading personnel">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row">
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton width={`${55 + ((i * 17) % 30)}%`} height={16} />
            <Skeleton width={`${30 + ((i * 11) % 25)}%`} height={12} />
          </div>
          <Skeleton width={64} height={28} radius={14} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonSummary() {
  return (
    <div className="strength" aria-busy="true" aria-label="Loading strength">
      <div className="strength__top">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Skeleton width={110} height={13} />
          <Skeleton width={140} height={40} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          <Skeleton width={96} height={28} radius={14} />
          <Skeleton width={80} height={12} />
        </div>
      </div>
      <Skeleton height={6} radius={3} />
      <Skeleton width="70%" height={12} />
    </div>
  );
}
