import { useEffect, useState } from 'react';
import { onlineManager, useMutationState } from '@tanstack/react-query';
import { MARK_MUTATION_KEY } from '../api/mutations';

export type SaveStatus = 'offline' | 'saving' | 'saved';

export interface ConnectionInfo {
  online: boolean;
  /** Marks waiting to be saved (paused offline or in flight). */
  pendingCount: number;
  status: SaveStatus;
}

export function useConnection(): ConnectionInfo {
  const [online, setOnline] = useState(onlineManager.isOnline());
  useEffect(() => onlineManager.subscribe(setOnline), []);

  const pending = useMutationState({
    filters: { mutationKey: MARK_MUTATION_KEY, status: 'pending' },
    select: (m) => m.state.status,
  });
  const pendingCount = pending.length;
  const status: SaveStatus = !online ? 'offline' : pendingCount > 0 ? 'saving' : 'saved';
  return { online, pendingCount, status };
}
