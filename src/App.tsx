import { lazy, Suspense, useEffect } from 'react';
import { createBrowserRouter, RouterProvider, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAssignmentStore } from './stores/assignmentStore';
import { useTaskStore } from './stores/taskStore';
import { useSettingsStore } from './stores/settingsStore';
import { useStreakStore } from './stores/streakStore';
import { checkAndNotify, setupAndroidNotificationChannel } from './services/notifications';
import { HomeIcon, ClipboardIcon, CalendarIcon, ChartBarIcon, SettingsIcon } from './components/Icons';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ToastContainer } from './components/common/Toast';

/* ── Lazy-loaded screens (code-split per route) ─────────────────── */
const Home            = lazy(() => import('./screens/Home'));
const Assignments     = lazy(() => import('./screens/Assignments'));
const AssignmentForm  = lazy(() => import('./screens/AssignmentForm'));
const AssignmentDetail = lazy(() => import('./screens/AssignmentDetail'));
const ImportOutline   = lazy(() => import('./screens/ImportOutline'));
const Calendar        = lazy(() => import('./screens/Calendar'));
const Stats           = lazy(() => import('./screens/Stats'));
const Settings        = lazy(() => import('./screens/Settings'));
const StudyTimer      = lazy(() => import('./screens/StudyTimer'));

/* ── Route skeleton while lazy chunk loads ──────────────────────── */
function ScreenSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-4 pt-14 animate-pulse">
      <div className="h-32 rounded-3xl bg-violet-100/60 dark:bg-violet-900/20" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-20 rounded-3xl bg-gray-100 dark:bg-gray-800/60" />
      ))}
    </div>
  );
}

const TABS = [
  { path: '/', label: 'Home', Icon: HomeIcon },
  { path: '/assignments', label: 'Work', Icon: ClipboardIcon },
  { path: '/calendar', label: 'Calendar', Icon: CalendarIcon },
  { path: '/stats', label: 'Stats', Icon: ChartBarIcon },
  { path: '/settings', label: 'Settings', Icon: SettingsIcon },
] as const;

const MAIN_PATHS = new Set(['/', '/assignments', '/calendar', '/stats', '/settings']);

function Shell() {
  const location  = useLocation();
  const navigate  = useNavigate();
  const theme     = useSettingsStore((s) => s.settings.theme);
  const showNav   = MAIN_PATHS.has(location.pathname);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <div
      className="w-full max-w-md flex flex-col shadow-2xl shadow-violet-900/20 dark:shadow-black/60 relative"
      style={{
        /*
         * min-height: 100dvh fills the full physical screen (including areas
         * behind transparent system bars) when edge-to-edge is active.
         * 100svh is the graceful fallback for older engines.
         */
        minHeight: '100svh',
        background:
          theme === 'dark'
            ? '#0a0a14'
            : 'linear-gradient(160deg, #ede8ff 0%, #f5f2ff 40%, #faf8ff 100%)',
        /*
         * paddingTop: pushes ALL screen content below the Android status bar.
         * env(safe-area-inset-top) is the status-bar height in CSS px.
         * Returns 0px on desktop so the web layout is unaffected.
         */
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <main
        className="flex-1 overflow-y-auto scrollbar-none"
        style={{
          /*
           * When the bottom nav is visible we need to clear:
           *   76px  — the nav bar's own visual height
           *   env(safe-area-inset-bottom) — the Android navigation bar / gesture
           *           handle that sits BELOW the nav bar at the very bottom of the
           *           screen.  This is what previously overlapped with the app buttons.
           * When the nav is hidden (detail screens) we still clear the system bar.
           */
          paddingBottom: showNav
            ? 'calc(76px + env(safe-area-inset-bottom, 0px))'
            : 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <Suspense fallback={<ScreenSkeleton />}>
          <Outlet />
        </Suspense>
      </main>

      {/* ── Toast overlay (above nav) ───────────────────── */}
      <ToastContainer />

      {/* ── Bottom nav ─────────────────────────────────── */}
      {showNav && (
        <nav className="fixed bottom-0 w-full max-w-md z-40">
          {/*
           * The outer div extends its background colour behind the Android
           * navigation bar via paddingBottom: env(safe-area-inset-bottom).
           * The inner row keeps the touchable tab buttons in the visible area
           * above the system bar with its own pt-2 pb-3 spacing.
           */}
          <div
            className="bg-white/88 dark:bg-[#0f0f1e]/95 backdrop-blur-2xl border-t border-violet-200/40 dark:border-violet-900/25 shadow-2xl shadow-violet-900/10 dark:shadow-black/50"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            <div className="flex items-end px-1.5 pt-2 pb-3">
              {TABS.map(({ path, label, Icon }) => {
                const active = location.pathname === path;
                return (
                  <button
                    key={path}
                    onClick={() => navigate(path)}
                    className="flex-1 flex flex-col items-center gap-0.5 transition-all duration-200"
                  >
                    <div
                      className={`flex items-center justify-center w-12 h-7 rounded-2xl transition-all duration-300 ${
                        active
                          ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 shadow-lg shadow-violet-400/35 dark:shadow-violet-700/35 scale-105'
                          : 'hover:bg-violet-50 dark:hover:bg-violet-950/40'
                      }`}
                    >
                      <Icon
                        className={`w-[17px] h-[17px] transition-all duration-200 ${
                          active ? 'text-white' : 'text-gray-400 dark:text-gray-500'
                        }`}
                      />
                    </div>
                    <span
                      className={`text-[9px] font-black tracking-wide transition-colors duration-200 ${
                        active
                          ? 'text-violet-600 dark:text-violet-400'
                          : 'text-gray-400 dark:text-gray-500'
                      }`}
                    >
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </nav>
      )}
    </div>
  );
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true,                         element: <Home /> },
      { path: 'assignments',                 element: <Assignments /> },
      { path: 'assignments/new',             element: <AssignmentForm /> },
      { path: 'assignments/import',          element: <ImportOutline /> },
      { path: 'assignments/:id',             element: <AssignmentDetail /> },
      { path: 'assignments/:id/edit',        element: <AssignmentForm /> },
      { path: 'assignments/:id/timer',       element: <StudyTimer /> },
      { path: 'calendar',                    element: <Calendar /> },
      { path: 'stats',                       element: <Stats /> },
      { path: 'settings',                    element: <Settings /> },
    ],
  },
]);

export default function App() {
  useEffect(() => {
    useAssignmentStore.getState().load();
    useTaskStore.getState().load();
    useSettingsStore.getState().load();
    useStreakStore.getState().init();

    // Set up the Android notification channel (idempotent; no-op on web)
    setupAndroidNotificationChannel().catch(console.error);

    const { assignments } = useAssignmentStore.getState();
    const { tasks }       = useTaskStore.getState();
    const { settings }    = useSettingsStore.getState();
    checkAndNotify(assignments, tasks, settings.notificationsEnabled, settings.notificationHour ?? 9, settings.notificationMinute ?? 0);
  }, []);

  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}
