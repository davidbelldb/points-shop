import { useState } from 'react';
import { api } from '../lib/api.js';
import { useSettings } from '../lib/SettingsContext.jsx';

/*
 * Floating Head — per-person on/off for the draggable partner photo that floats
 * over the home page. David (admin) defaults on; Katie (partner) defaults off
 * until switched on here after testing.
 */
export default function AdminFloatingHeadSection() {
  const { settings, refresh: refreshSettings } = useSettings();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Admin defaults ON (missing key = on); partner defaults OFF.
  const davidOn = settings.floating_head_admin !== 'false';
  const katieOn = settings.floating_head_partner === 'true';

  async function set(key, value) {
    setBusy(true); setError(null);
    try {
      await api.admin.updateSettings({ [key]: value ? 'true' : 'false' });
      await refreshSettings();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const Row = ({ label, hint, on, onToggle }) => (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-700">
      <div>
        <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">{label}</p>
        {hint && <p className="text-xs text-neutral-500">{hint}</p>}
      </div>
      <button
        onClick={onToggle}
        disabled={busy}
        className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-60 ${
          on ? 'bg-emerald-600 text-white' : 'bg-neutral-200 text-neutral-700'
        }`}
      >
        {on ? 'On' : 'Off'}
      </button>
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-600 dark:text-neutral-300">
        Shows a draggable photo of the other person on the home page. Drag it to
        either edge; tap it to open the chat. The teal bubble shows unread
        messages from that person.
      </p>
      <Row
        label="David"
        hint="Floating head of Katie on David's home page."
        on={davidOn}
        onToggle={() => set('floating_head_admin', !davidOn)}
      />
      <Row
        label="Katie"
        hint="Floating head of David on Katie's home page (enable once tested)."
        on={katieOn}
        onToggle={() => set('floating_head_partner', !katieOn)}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
