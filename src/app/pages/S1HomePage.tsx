import { Link } from 'react-router-dom';
import { useMe, useUnits } from '../api/queries';
import { TopBar } from '../components/ui';
import { useBackend } from '../providers';

/** Placeholder until the S1 dashboard lands in M4: a way into each unit's roll. */
export function S1HomePage() {
  const { session } = useBackend();
  const me = useMe();
  const units = useUnits();
  const today = me.data?.sgToday;
  return (
    <>
      <TopBar
        title="S1"
        subtitle={me.data?.user.displayName}
        right={
          <button type="button" className="btn btn--text" onClick={() => void session.signOut()}>
            Sign out
          </button>
        }
      />
      <main className="screen">
        <p className="muted">The battalion summary arrives in the next milestone. Until then, open any unit's roll.</p>
        <div className="card card--flush">
          <ul className="list">
            {units.data?.units.map((u) => (
              <li key={u.id}>
                <Link to={`/units/${u.id}/events/${today}-AM`} className="list-row" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <span className="list-row__main">
                    <span className="list-row__title">{u.name}</span>
                  </span>
                  <span className="muted">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <Link to="/change-password" className="btn btn--ghost">
          Change password
        </Link>
      </main>
    </>
  );
}
