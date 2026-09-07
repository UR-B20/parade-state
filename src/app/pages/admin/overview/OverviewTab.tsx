import { useMemo } from 'react';
import { buildBriefing } from '@shared/domain';
import type { BattalionSummaryDto, TrendsDto } from '@shared/types';
import { ApiError } from '../../../api/client';
import { Button } from '../../../components/Button';
import { EmptyState } from '../../../components/EmptyState';
import { Skeleton } from '../../../components/Skeleton';
import { AbsenceReasons } from './AbsenceReasons';
import { Briefing } from './Briefing';
import { CompositionDonut } from './CompositionDonut';
import { KpiTiles } from './KpiTiles';
import { Timeliness } from './Timeliness';
import { TrendLine } from './TrendLine';
import { UnitStack } from './UnitStack';
import { useTheme } from '../../../state/theme';

interface OverviewTabProps {
  summary: BattalionSummaryDto | undefined;
  trends: TrendsDto | undefined;
  error: unknown;
  onRetry: () => void;
}

export function OverviewTab({ summary, trends, error, onRetry }: OverviewTabProps) {
  const { resolved: theme } = useTheme();
  const briefing = useMemo(() => (trends ? buildBriefing(trends, summary) : null), [trends, summary]);
  if (error && !(summary && trends)) {
    return <EmptyState icon="alert" title="Couldn't load the overview" text={error instanceof ApiError ? error.message : 'Check your connection and try again.'} action={<Button onClick={onRetry}>Try again</Button>} />;
  }
  if (!summary || !trends || !briefing) {
    return (
      <div className="grid gap-3" aria-busy="true" aria-label="Loading overview">
        <Skeleton height={96} />
        <div className="grid grid-cols-2 gap-3 wide:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={104} />)}</div>
        <div className="grid gap-3 wide:grid-cols-12"><div className="wide:col-span-4"><Skeleton height={320} /></div><div className="wide:col-span-8"><Skeleton height={320} /></div></div>
      </div>
    );
  }
  return (
    <div className="grid gap-3" key={theme}>
      <Briefing briefing={briefing} />
      <KpiTiles summary={summary} trends={trends} briefing={briefing} />
      <div className="grid gap-3 wide:grid-cols-12">
        <div className="min-w-0 wide:col-span-4"><CompositionDonut counts={summary.totals} /></div>
        <div className="min-w-0 wide:col-span-8"><UnitStack summary={summary} /></div>
        <div className="min-w-0 wide:col-span-8"><TrendLine trends={trends} briefing={briefing} /></div>
        <div className="min-w-0 wide:col-span-4"><AbsenceReasons trends={trends} /></div>
        <div className="min-w-0 wide:col-span-12"><Timeliness trends={trends} /></div>
      </div>
    </div>
  );
}
