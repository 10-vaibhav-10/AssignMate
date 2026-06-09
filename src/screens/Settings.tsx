import { useState, useRef, useEffect } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { useAssignmentStore } from '../stores/assignmentStore';
import { useTaskStore } from '../stores/taskStore';
import { storage } from '../services/storage';
import { toast } from '../stores/toastStore';
import { downloadICalendar, shareOrDownloadJson } from '../services/calendar';
import {
  requestNotificationPermission,
  getNotificationPermission,
  refreshAndroidPermission,
  canScheduleExactAlarms,
  checkAndNotify,
} from '../services/notifications';
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
  const tasks           = useTaskStore((s) => s.tasks);
  const loadTasks       = useTaskStore((s) => s.load);

  const [showClearDialog,  setShowClearDialog]  = useState(false);
  const [permState,        setPermState]        = useState<NotificationPermission>(getNotificationPermission());
  const [notifRequesting,  setNotifRequesting]  = useState(false);
  const [exactAlarmOk,     setExactAlarmOk]     = useState(true);

  const backupFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    refreshAndroidPermission().then(setPermState).catch(() => {});
    canScheduleExactAlarms().then(setExactAlarmOk).catch(() => {});
  }, []);

  /* ── Clear all ────────────────────────────────────────────────── */
  function handleClearAll() {
    storage.clearAll();
    loadAssignments();
    loadTasks();
    setShowClearDialog(false);
    toast.success('Everything cleared. Fresh start!');
  }

  /* ── Notifications ────────────────────────────────────────────── */
  async function handleRequestPermission() {
    setNotifRequesting(true);
    const perm = await requestNotificationPermission();
    setPermState(perm);
    if (perm === 'granted') {
      updateSettings({ notificationsEnabled: true });
      checkAndNotify(assignments, tasks, true, settings.notificationHour ?? 9, settings.notificationMinute ?? 0);
      if (isAndroid) toast.success(`You're all set! Reminders will arrive at ${formatTime(settings.notificationHour ?? 9, settings.notificationMinute ?? 0)}.`);
    }
    setNotifRequesting(false);
  }

  function handleToggleNotifications(enabled: boolean) {
    updateSettings({ notificationsEnabled: enabled });
    if (enabled) checkAndNotify(assignments, tasks, true, settings.notificationHour ?? 9, settings.notificationMinute ?? 0);
  }

  /* ── Calendar export ─────────────────────────────────────────── */
  async function handleExportCalendar() {
    if (assignments.length === 0) {
      toast.warning('No assignments to export yet.');
      return;
    }
    try {
      await downloadICalendar(assignments);
      if (!isAndroid) toast.success('Calendar file downloaded!');
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        toast.error('Could not export calendar.');
      }
    }
  }

  /* ── JSON backup ─────────────────────────────────────────────── */
  async function handleExportBackup() {
    const json     = storage.exportAll();
    const filename = `assignmate-backup-${new Date().toISOString().split('T')[0]}.json`;
    try {
      await shareOrDownloadJson(json, filename);
      if (!isAndroid) toast.success('Backup downloaded!');
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        toast.error('Could not export backup.');
      }
    }
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
      toast.success('Backup restored! Welcome back 🎉');
    } catch {
      toast.error('That file doesn\'t look right — please use an AssignMate backup.');
    }
  }

  /* ── Pomodoro timer steppers ─────────────────────────────────── */
  function adjustTimer(field: 'timerWork' | 'timerBreak', delta: number) {
    const min = field === 'timerWork' ? 5 : 1;
    const max = field === 'timerWork' ? 90 : 30;
    updateSettings({ [field]: Math.min(max, Math.max(min, settings[field] + delta)) });
  }

  /* ── Reminder time (15-min steps through the full day) ──────── */
  function adjustNotificationTime(delta: number) {
    const h  = settings.notificationHour   ?? 9;
    const m  = settings.notificationMinute ?? 0;
    const currentSlot = h * 4 + Math.round(m / 15);
    const nextSlot    = (currentSlot + delta + 96) % 96;
    const nextHour    = Math.floor(nextSlot / 4);
    const nextMinute  = (nextSlot % 4) * 15;
    updateSettings({ notificationHour: nextHour, notificationMinute: nextMinute });
    if (settings.notificationsEnabled) {
      checkAndNotify(assignments, tasks, true, nextHour, nextMinute);
    }
  }

  const isDark = settings.theme === 'dark';
  const reminderTime = formatTime(settings.notificationHour ?? 9, settings.notificationMinute ?? 0);

  return (
    <div className="pb-8">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="relative bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-700 overflow-hidden px-5 pt-14 pb-6">
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-violet-400/20 rounded-full blur-3xl pointer-events-none" />
        <h1 className="relative text-white text-2xl font-extrabold">Settings</h1>
        <p className="relative text-indigo-200 text-sm font-medium mt-0.5">Tweak things to your liking</p>
      </div>

      <div className="px-4 -mt-3 relative z-10 space-y-3">

        {/* ── Appearance ─────────────────────────────────────── */}
        <SettingsSection icon="🎨" iconBg="bg-indigo-100 dark:bg-indigo-900/40" title="Appearance">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Pick whichever feels better on your eyes.</p>
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
        <SettingsSection icon="⏱️" iconBg="bg-violet-100 dark:bg-violet-900/30" title="Focus Timer">

          <div className="flex items-center justify-between py-1.5">
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Focus duration</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">How long each work block runs</p>
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

          <div className="flex items-center justify-between py-1.5 border-t border-gray-50 dark:border-gray-700 mt-1">
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Short break</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">Breather between focus blocks</p>
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

          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 mb-1 bg-gray-50 dark:bg-gray-700/60 px-3 py-2 rounded-xl">
            🏖️ After 4 focus blocks you'll earn a longer 15-minute break automatically.
          </p>

          <div className="flex items-center justify-between py-1.5 border-t border-gray-50 dark:border-gray-700 mt-1">
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">End-of-session sound</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">A beep when each block finishes</p>
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
        <SettingsSection icon="🔔" iconBg="bg-violet-100 dark:bg-violet-900/30" title="Reminders">
          {(!isAndroid && !('Notification' in window)) ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Your browser doesn't support notifications.
            </p>
          ) : permState === 'denied' ? (
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                {isAndroid
                  ? 'Notifications are turned off. Head to Android Settings → Apps → AssignMate → Notifications to switch them back on.'
                  : "Notifications are blocked in your browser. Open site settings and allow them to enable reminders."}
              </p>
              <span className="inline-block text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2.5 py-1 rounded-full font-bold">
                {isAndroid ? '⚡ Blocked in system settings' : '⚡ Blocked by browser'}
              </span>
            </div>
          ) : permState === 'default' ? (
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 leading-relaxed">
                Stay on top of deadlines and individual tasks without having to check the app constantly.
              </p>
              <Button
                onClick={handleRequestPermission}
                fullWidth
                variant={notifRequesting ? 'secondary' : 'primary'}
              >
                {notifRequesting ? 'Just a moment…' : '🔔 Turn on Reminders'}
              </Button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 leading-relaxed">
                You'll hear from us 3 days out, the day before, on the day itself, and the day after — for both assignments and individual tasks.
              </p>

              {/* Toggle */}
              <div className="flex items-center justify-between py-1">
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Reminders on</span>
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

              {/* Time picker */}
              <div className="flex items-center justify-between py-1.5 border-t border-gray-50 dark:border-gray-700 mt-2">
                <div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Remind me at</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Steps in 15-minute slots</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => adjustNotificationTime(-1)}
                    className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold flex items-center justify-center hover:bg-violet-100 dark:hover:bg-violet-900/40 hover:text-violet-600 transition-colors text-lg leading-none"
                  >
                    −
                  </button>
                  <span className="w-20 text-center text-sm font-black text-gray-900 dark:text-white tabular-nums">
                    {reminderTime}
                  </span>
                  <button
                    onClick={() => adjustNotificationTime(1)}
                    className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold flex items-center justify-center hover:bg-violet-100 dark:hover:bg-violet-900/40 hover:text-violet-600 transition-colors text-lg leading-none"
                  >
                    +
                  </button>
                </div>
              </div>

              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                Your reminders will arrive at {reminderTime} each day — for deadlines and any tasks due that day.
              </p>

              {isAndroid && !exactAlarmOk && (
                <div className="mt-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl p-3">
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-1">
                    ⚠️ Precise timing isn't enabled
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-500 leading-relaxed">
                    Go to <strong>Settings → Apps → AssignMate → Alarms &amp; Reminders</strong> and
                    switch it on so your reminders arrive exactly when you set them.
                  </p>
                </div>
              )}
            </div>
          )}
        </SettingsSection>

        {/* ── How to use ─────────────────────────────────────── */}
        <SettingsSection icon="💡" iconBg="bg-amber-100 dark:bg-amber-900/30" title="Quick guide">
          <div className="space-y-3">
            {[
              ['📥', 'Import an outline', 'Drop in your subject PDF and we\'ll pull out every assignment automatically'],
              ['✨', 'Get a study plan', 'Open any assignment and tap "Analyse" — AI will break it into daily tasks for you'],
              ['⏱️', 'Log study time', 'Hit the timer inside any assignment to track how long you\'ve spent on it'],
              ['✅', 'Tick off tasks', 'Check tasks off as you go and watch your progress climb'],
              ['📊', 'See your progress', 'Head to Stats for streaks, time logged, and a subject breakdown'],
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
        <SettingsSection icon="🗃️" iconBg="bg-red-100 dark:bg-red-900/30" title="Your data">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            Everything stays {isAndroid ? 'on your device' : 'in your browser'} — nothing is uploaded anywhere.
          </p>

          <Button
            fullWidth
            onClick={handleExportCalendar}
            variant="secondary"
            className="mb-2 flex items-center gap-2 justify-center"
          >
            <DownloadIcon className="w-4 h-4" />
            Add to Calendar
          </Button>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4 text-center">
            Opens in Google Calendar, Apple Calendar, or Outlook
          </p>

          <Button
            fullWidth
            onClick={handleExportBackup}
            variant="secondary"
            className="mb-2 flex items-center gap-2 justify-center"
          >
            💾 Save a backup
          </Button>

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
            📤 Restore from backup
          </Button>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4 text-center">
            Includes all your assignments, tasks, and settings.
          </p>

          <Button variant="danger" fullWidth onClick={() => setShowClearDialog(true)}>
            Clear everything
          </Button>
        </SettingsSection>

        {/* ── About ──────────────────────────────────────────── */}
        <SettingsSection icon="ℹ️" iconBg="bg-gray-100 dark:bg-gray-700/50" title="About">
          <div className="space-y-1.5">
            <InfoRow label="App"     value="AssignMate" />
            <InfoRow label="Version" value="2.2.0" />
          </div>
        </SettingsSection>
      </div>

      <ConfirmDialog
        isOpen={showClearDialog}
        title="Clear everything?"
        message="This will permanently delete all your assignments and tasks. There's no undo."
        confirmLabel="Yes, clear it all"
        onConfirm={handleClearAll}
        onCancel={() => setShowClearDialog(false)}
      />
    </div>
  );
}

/* ── Helpers ────────────────────────────────────────────────────── */

function formatTime(h: number, m: number): string {
  const hour = h % 12 || 12;
  const ampm = h < 12 ? 'AM' : 'PM';
  const mins = m.toString().padStart(2, '0');
  return `${hour}:${mins} ${ampm}`;
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
