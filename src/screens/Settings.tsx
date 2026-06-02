import { useState, useRef } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { useAssignmentStore } from '../stores/assignmentStore';
import { useTaskStore } from '../stores/taskStore';
import { storage } from '../services/storage';
import { toast } from '../stores/toastStore';
import { downloadICalendar } from '../services/calendar';
import { requestNotificationPermission, getNotificationPermission, checkAndNotify } from '../services/notifications';
import { Button } from '../components/common/Button';
import { ConfirmDialog } from '../components/dialogs/ConfirmDialog';
import { SunIcon, MoonIcon, DownloadIcon } from '../components/Icons';
import { isAndroid } from '../utils';

export default function Settings() {
  const settings        = useSettingsStore((s) => s.settings);
  const updateSettings  = useSettingsStore((s) => s.update);
  const loadSettings    = useSettingsStore((s) => s.load);
  const assignments     = useAssignmentStore((s) => s.assignments);
  const loadAssignments = useAssignmentStore((s) => s.load);
  const loadTasks       = useTaskStore((s) => s.load);

  const [showClearDialog, setShowClearDialog] = useState(false);
  const [permState,       setPermState]       = useState<NotificationPermission>(getNotificationPermission());
  const [notifRequesting, setNotifRequesting] = useState(false);

  const backupFileRef = useRef<HTMLInputElement>(null);

  /* ── Clear all ────────────────────────────────────────────────── */
  function handleClearAll() {
    storage.clearAll();
    loadAssignments();
    loadTasks();
    setShowClearDialog(false);
    toast.success('All data cleared.');
  }

  /* ── Notifications ────────────────────────────────────────────── */
  async function handleRequestPermission() {
    setNotifRequesting(true);
    const perm = await requestNotificationPermission();
    setPermState(perm);
    if (perm === 'granted') {
      updateSettings({ notificationsEnabled: true });
      checkAndNotify(assignments, true);
    }
    setNotifRequesting(false);
  }

  function handleToggleNotifications(enabled: boolean) {
    updateSettings({ notificationsEnabled: enabled });
    if (enabled) checkAndNotify(assignments, true);
  }

  /* ── Calendar export ─────────────────────────────────────────── */
  function handleExportCalendar() {
    if (assignments.length === 0) {
      toast.warning('No assignments to export.');
      return;
    }
    downloadICalendar(assignments);
    toast.success('Calendar file downloaded!');
  }

  /* ── JSON backup ─────────────────────────────────────────────── */
  function handleExportBackup() {
    const json = storage.exportAll();
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `assignmate-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Backup downloaded!');
  }

  async function handleImportBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const text = await file.text();
      storage.importAll(text);
      loadAssignments();
      loadTasks();
      loadSettings();
      toast.success('Backup restored successfully! 🎉');
    } catch {
      toast.error('Invalid backup file — please use an AssignMate backup.');
    }
  }

  /* ── Timer stepper helpers ───────────────────────────────────── */
  function adjustTimer(field: 'timerWork' | 'timerBreak', delta: number) {
    const min = field === 'timerWork' ? 5 : 1;
    const max = field === 'timerWork' ? 90 : 30;
    updateSettings({ [field]: Math.min(max, Math.max(min, settings[field] + delta)) });
  }

  const isDark = settings.theme === 'dark';

  return (
    <div className="pb-8">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="relative bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-700 overflow-hidden px-5 pt-14 pb-6">
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-violet-400/20 rounded-full blur-3xl pointer-events-none" />
        <h1 className="relative text-white text-2xl font-extrabold">Settings</h1>
        <p className="relative text-indigo-200 text-sm font-medium mt-0.5">Manage your app preferences</p>
      </div>

      <div className="px-4 -mt-3 relative z-10 space-y-3">

        {/* ── Appearance ─────────────────────────────────────── */}
        <SettingsSection icon="🎨" iconBg="bg-indigo-100 dark:bg-indigo-900/40" title="Appearance">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Switch between light and dark mode.</p>
          <div className="flex gap-2">
            <button
              onClick={() => updateSettings({ theme: 'light' })}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-semibold text-sm transition-all ${
                !isDark
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <SunIcon className="w-4 h-4" />
              Light
            </button>
            <button
              onClick={() => updateSettings({ theme: 'dark' })}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-semibold text-sm transition-all ${
                isDark
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <MoonIcon className="w-4 h-4" />
              Dark
            </button>
          </div>
        </SettingsSection>

        {/* ── Pomodoro Timer ─────────────────────────────────── */}
        <SettingsSection icon="⏱️" iconBg="bg-violet-100 dark:bg-violet-900/30" title="Pomodoro Timer">

          {/* Work duration */}
          <div className="flex items-center justify-between py-1.5">
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Focus duration</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">Default: 25 min</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => adjustTimer('timerWork', -5)}
                disabled={settings.timerWork <= 5}
                className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold flex items-center justify-center hover:bg-violet-100 dark:hover:bg-violet-900/40 hover:text-violet-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-lg leading-none"
              >
                −
              </button>
              <span className="w-16 text-center text-sm font-black text-gray-900 dark:text-white tabular-nums">
                {settings.timerWork} min
              </span>
              <button
                onClick={() => adjustTimer('timerWork', 5)}
                disabled={settings.timerWork >= 90}
                className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold flex items-center justify-center hover:bg-violet-100 dark:hover:bg-violet-900/40 hover:text-violet-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-lg leading-none"
              >
                +
              </button>
            </div>
          </div>

          {/* Short break */}
          <div className="flex items-center justify-between py-1.5 border-t border-gray-50 dark:border-gray-700 mt-1">
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Short break</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">Default: 5 min</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => adjustTimer('timerBreak', -1)}
                disabled={settings.timerBreak <= 1}
                className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold flex items-center justify-center hover:bg-emerald-100 dark:hover:bg-emerald-900/40 hover:text-emerald-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-lg leading-none"
              >
                −
              </button>
              <span className="w-16 text-center text-sm font-black text-gray-900 dark:text-white tabular-nums">
                {settings.timerBreak} min
              </span>
              <button
                onClick={() => adjustTimer('timerBreak', 1)}
                disabled={settings.timerBreak >= 30}
                className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold flex items-center justify-center hover:bg-emerald-100 dark:hover:bg-emerald-900/40 hover:text-emerald-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-lg leading-none"
              >
                +
              </button>
            </div>
          </div>

          {/* Long break info */}
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 mb-1 bg-gray-50 dark:bg-gray-700/60 px-3 py-2 rounded-xl">
            🏖️ Long break (15 min) fires automatically after every 4 focus sessions.
          </p>

          {/* Sound toggle */}
          <div className="flex items-center justify-between py-1.5 border-t border-gray-50 dark:border-gray-700 mt-1">
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Session sound</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">Beep when each session ends</p>
            </div>
            <button
              onClick={() => updateSettings({ timerSound: !settings.timerSound })}
              className={`relative inline-flex rounded-full transition-colors duration-200 focus:outline-none ${
                settings.timerSound
                  ? 'bg-gradient-to-r from-indigo-500 to-violet-600'
                  : 'bg-gray-200 dark:bg-gray-600'
              }`}
              style={{ height: '26px', width: '48px' }}
              aria-label="Toggle timer sound"
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 ${
                  settings.timerSound ? 'translate-x-[22px]' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </SettingsSection>

        {/* ── Notifications ──────────────────────────────────── */}
        <SettingsSection icon="🔔" iconBg="bg-violet-100 dark:bg-violet-900/30" title="Notifications">
          {!('Notification' in window) ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {isAndroid ? 'Notifications are not available in this version.' : 'Not supported in this browser.'}
            </p>
          ) : permState === 'denied' ? (
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                {isAndroid
                  ? 'Notifications are blocked. Enable them in Android Settings → Apps → AssignMate → Notifications.'
                  : "Notifications are blocked. Allow them in your browser's site settings."}
              </p>
              <span className="inline-block text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2.5 py-1 rounded-full font-bold">
                {isAndroid ? '⚡ Blocked in app settings' : '⚡ Blocked by browser'}
              </span>
            </div>
          ) : permState === 'default' ? (
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 leading-relaxed">
                Get notified when assignments are overdue or due soon.
              </p>
              <Button
                onClick={handleRequestPermission}
                fullWidth
                variant={notifRequesting ? 'secondary' : 'primary'}
              >
                {notifRequesting ? 'Requesting…' : '🔔 Enable Notifications'}
              </Button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                You'll be notified for overdue, due today, and due within 3 days.
              </p>
              <div className="flex items-center justify-between py-1">
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Reminders enabled</span>
                <button
                  onClick={() => handleToggleNotifications(!settings.notificationsEnabled)}
                  className={`relative inline-flex rounded-full transition-colors duration-200 focus:outline-none ${
                    settings.notificationsEnabled
                      ? 'bg-gradient-to-r from-indigo-500 to-violet-600'
                      : 'bg-gray-200 dark:bg-gray-600'
                  }`}
                  style={{ height: '26px', width: '48px' }}
                  aria-label="Toggle notifications"
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 ${
                      settings.notificationsEnabled ? 'translate-x-[22px]' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Fires once per day per assignment.</p>
            </div>
          )}
        </SettingsSection>

        {/* ── How to use ─────────────────────────────────────── */}
        <SettingsSection icon="💡" iconBg="bg-amber-100 dark:bg-amber-900/30" title="How to use">
          <div className="space-y-3">
            {[
              ['📥', 'Import outline', 'Upload your subject PDF — AI extracts all assignments instantly'],
              ['✨', 'AI Analysis', 'Open any assignment → tap "Analyse with AI" for a study plan'],
              ['⏱️', 'Study Timer', 'Use the timer icon in any assignment to log study time'],
              ['✅', 'Track tasks', 'Check off tasks to automatically update your progress'],
              ['📊', 'Stats', 'See your streak, subject breakdown, and logged study time'],
            ].map(([icon, step, desc]) => (
              <div key={step} className="flex gap-3 items-start">
                <span className="text-base mt-0.5">{icon}</span>
                <div>
                  <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400">{step}</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </SettingsSection>

        {/* ── Data Management ────────────────────────────────── */}
        <SettingsSection icon="🗃️" iconBg="bg-red-100 dark:bg-red-900/30" title="Data Management">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            {isAndroid ? 'All data is stored locally on your device.' : 'All data is stored locally in your browser.'}
          </p>

          {/* Calendar export */}
          <Button
            fullWidth
            onClick={handleExportCalendar}
            variant="secondary"
            className="mb-2 flex items-center gap-2 justify-center"
          >
            <DownloadIcon className="w-4 h-4" />
            Export to Calendar (.ics)
          </Button>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4 text-center">
            Import into Google Calendar, Apple Calendar, or Outlook
          </p>

          {/* JSON backup */}
          <Button
            fullWidth
            onClick={handleExportBackup}
            variant="secondary"
            className="mb-2 flex items-center gap-2 justify-center"
          >
            💾 Download Backup (.json)
          </Button>

          {/* JSON restore */}
          <input
            ref={backupFileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImportBackup}
          />
          <Button
            fullWidth
            onClick={() => backupFileRef.current?.click()}
            variant="secondary"
            className="mb-4 flex items-center gap-2 justify-center"
          >
            📤 Restore from Backup
          </Button>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4 text-center">
            Backup includes all assignments, tasks, and settings.
          </p>

          {/* Danger */}
          <Button variant="danger" fullWidth onClick={() => setShowClearDialog(true)}>
            Clear All Data
          </Button>
        </SettingsSection>

        {/* ── About ──────────────────────────────────────────── */}
        <SettingsSection icon="ℹ️" iconBg="bg-gray-100 dark:bg-gray-700/50" title="About">
          <div className="space-y-1.5">
            <InfoRow label="App"      value="AssignMate" />
            <InfoRow label="Version"  value="2.2.0" />
            <InfoRow label="AI"       value="Groq · Llama 3.3 70B (server-side)" />
            <InfoRow label="Storage"  value="Browser LocalStorage" />
          </div>
        </SettingsSection>
      </div>

      <ConfirmDialog
        isOpen={showClearDialog}
        title="Clear all data?"
        message="This will permanently delete all your assignments and tasks. This action cannot be undone."
        confirmLabel="Clear All"
        onConfirm={handleClearAll}
        onCancel={() => setShowClearDialog(false)}
      />
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────── */

function SettingsSection({
  icon,
  iconBg,
  title,
  children,
}: {
  icon: string;
  iconBg: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm shadow-indigo-100/40 dark:shadow-gray-900/30 p-4">
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`w-7 h-7 ${iconBg} rounded-xl flex items-center justify-center text-base`}>
          {icon}
        </div>
        <h2 className="font-bold text-gray-900 dark:text-white text-sm">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-gray-50 dark:border-gray-700 last:border-0">
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-sm text-gray-800 dark:text-gray-200 font-semibold">{value}</span>
    </div>
  );
}
