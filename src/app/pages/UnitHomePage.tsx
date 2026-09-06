import { Navigate, useParams } from 'react-router-dom';
import { useMe } from '../api/queries';
import { Spinner } from '../components/ui';
import { formatSgTime } from '@shared/dates';

/** Sends the commander to the parade that is on now: AM until midday, PM after. */
export function UnitHomePage() {
  const { unitId } = useParams();
  const me = useMe();
  if (!me.data) return <Spinner />;
  const hour = Number(formatSgTime(me.data.serverNow).slice(0, 2));
  const type = hour < 12 ? 'AM' : 'PM';
  return <Navigate to={`/units/${unitId}/events/${me.data.sgToday}-${type}`} replace />;
}
