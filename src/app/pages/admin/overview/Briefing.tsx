import type { Briefing as BriefingModel, InsightTone } from '@shared/domain';

const dotClass: Record<InsightTone, string> = { ok: 'bg-ok', warn: 'bg-warn', danger: 'bg-danger', neutral: 'bg-ink-3' };

export function Briefing({ briefing }: { briefing: BriefingModel }) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 wide:flex-row wide:gap-6 wide:p-5" aria-label="Executive summary">
      <div className="flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-2">Headline</p>
        <p className="mt-1 text-[17px] font-semibold leading-snug text-ink wide:text-[18px]">{briefing.headline}</p>
      </div>
      <ul className="flex flex-1 flex-col gap-2 border-t border-line pt-3 wide:border-l wide:border-t-0 wide:pl-6 wide:pt-0" aria-label="Insights">
        {briefing.items.map((it, i) => (
          <li key={i} className="flex gap-2.5 text-[13px] leading-snug text-ink">
            <span aria-hidden="true" className={`mt-1.5 h-2 w-2 flex-none rounded-full ${dotClass[it.tone]}`} />
            <span>{it.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
