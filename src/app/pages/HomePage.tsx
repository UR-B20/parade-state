import { Navigate } from 'react-router-dom';
import { useMe } from '../api/queries';
import { Spinner } from '../components/ui';

export function HomePage() {
  const me = useMe();
  if (!me.data) return <Spinner />;
  const { user } = me.data;
  if (user.role === 'COMMANDER' && user.unitId) return <Navigate to={`/units/${user.unitId}`} replace />;
  return <Navigate to="/s1" replace />;
}
