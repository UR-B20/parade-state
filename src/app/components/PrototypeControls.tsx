import { formatSgDateLong, formatSgTime, sgDateOf, sgLocalToIso } from '@shared/dates';
import { useSetDemoClock } from '../api/mutations';
import { useAuth } from '../state/auth';
import { useDemo } from '../state/demo';
import { Button } from './Button';
import { Sheet } from './Sheet';
import './Admin.css';

const DEMO_DATE = '2026-09-06';

const PRESETS: { label: string; hint: string; time: string }[] = [
  { label: '09:24', hint: 'Before AM cut-off', time: '09:24' },
  { label: '10:05', hint: 'After AM cut-off', time: '10:05' },
  { label: '13:50', hint: 'Before PM cut-off', time: '13:50' },
  { label: '14:30', hint: 'After PM cut-off', time: '14:30' },
];

/** Demo-only controls for reviewers. Never shown when demo controls are off. */
export function PrototypeControls({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useAuth();
  const demo = useDemo();
  const setClock = useSetDemoClock();
  const current = me.demo.now;
  const currentDate = current ? sgDateOf(current) : null;

  return (
    <Sheet open={open} onClose={onClose} title="Prototype controls" subtitle="For review only. Not part of the product.">
      <div className="field">
        <span className="field__label">Demo clock</span>
        <p className="dialog__muted num">
          {current ? `${formatSgDateLong(currentDate!)} · ${formatSgTime(current)}` : 'Real time'}. Affects cut-off and Late states only; saves and submissions keep their real timestamps.
        </p>
        <div className="preset-grid">
          {PRESETS.map((p) => {
            const iso = sgLocalToIso(currentDate ?? DEMO_DATE, p.time);
            const active = current === iso;
            return (
              <Button key={p.time} variant={active ? 'primary' : 'secondary'} onClick={() => setClock.mutate(iso)} busy={setClock.isPending && setClock.variables === iso}>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.2 }}>
                  <span className="num">{p.label}</span>
                  <small style={{ fontWeight: 500, opacity: 0.8 }}>{p.hint}</small>
                </span>
              </Button>
            );
          })}
        </div>
        <div className="filters">
          <button type="button" className="chip" aria-pressed={currentDate === DEMO_DATE} onClick={() => setClock.mutate(sgLocalToIso(DEMO_DATE, current ? formatSgTime(current) : '09:24'))}>
            Jump to 6 Sep 2026
          </button>
          <button type="button" className="chip" aria-pressed={current === null} onClick={() => setClock.mutate(null)}>
            Use real time
          </button>
        </div>
      </div>

      <div className="toggle">
        <div>
          <div style={{ fontWeight: 600 }}>Simulate connection loss</div>
          <div className="dialog__muted">Marks queue locally and save when you reconnect.</div>
        </div>
        <button type="button" role="switch" aria-checked={demo.simulatedOffline} aria-label="Simulate connection loss" className="switch" onClick={() => demo.setSimulatedOffline(!demo.simulatedOffline)} />
      </div>
    </Sheet>
  );
}
