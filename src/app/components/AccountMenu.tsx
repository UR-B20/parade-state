import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSignOut } from '../api/mutations';
import { useAuth } from '../state/auth';
import { useDemo } from '../state/demo';
import { useTheme, type ThemePref } from '../state/theme';
import { Button } from './Button';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { PrototypeControls } from './PrototypeControls';
import './Admin.css';

function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w));
  return `${words[0]?.[0] ?? ''}${words.length > 1 ? words[words.length - 1]?.[0] ?? '' : ''}`.toUpperCase();
}

export function AccountButton({ onClick }: { onClick: () => void }) {
  const { user } = useAuth();
  return (
    <Button variant="ghost" small icon onClick={onClick} aria-label="Account menu">
      <span className="avatar" style={{ width: 32, height: 32, fontSize: 12 }}>{initialsOf(user.displayName)}</span>
    </Button>
  );
}

export function AccountMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const demo = useDemo();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const [controlsOpen, setControlsOpen] = useState(false);

  const theme = useTheme();
  const roleLabel = user.role === 'ADMIN' ? 'S1 Branch admin' : `Commander`;
  const prefs: { id: ThemePref; label: string }[] = [{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }, { id: 'system', label: 'Device' }];

  return (
    <>
      <Sheet open={open && !controlsOpen} onClose={onClose} title="Account">
        <div className="account-card">
          <span className="avatar">{initialsOf(user.displayName)}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600 }} className="truncate">{user.displayName}</div>
            <div className="dialog__muted truncate">{roleLabel} · {user.username}</div>
          </div>
        </div>
        <div className="field">
          <span className="field__label">Appearance</span>
          <div className="segmented" role="group" aria-label="Appearance">
            {prefs.map((p) => (
              <button key={p.id} type="button" className="segmented__option" aria-pressed={theme.pref === p.id} onClick={() => theme.setPref(p.id)}>{p.label}</button>
            ))}
          </div>
        </div>
        <div className="menu-list">
          {user.role === 'ADMIN' && (
            <>
              <Link to="/admin/users" className="menu-item" onClick={onClose}><Icon name="users" /> Manage accounts</Link>
              <Link to="/admin/settings" className="menu-item" onClick={onClose}><Icon name="settings" /> Cut-offs and date unlocks</Link>
            </>
          )}
          <Link to="/account/password" className="menu-item" onClick={onClose}><Icon name="lock" /> Change password</Link>
          {demo.available && (
            <button type="button" className="menu-item" onClick={() => setControlsOpen(true)}>
              <Icon name="sliders" /> Prototype controls
            </button>
          )}
          <button
            type="button"
            className="menu-item menu-item--danger"
            disabled={signOut.isPending}
            onClick={() => signOut.mutate(undefined, { onSuccess: () => { onClose(); navigate('/login', { replace: true }); } })}
          >
            <Icon name="logout" /> Sign out
          </button>
        </div>
      </Sheet>
      <PrototypeControls open={controlsOpen} onClose={() => { setControlsOpen(false); onClose(); }} />
    </>
  );
}
