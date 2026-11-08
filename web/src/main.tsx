import { StrictMode, Suspense, lazy, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createBrowserRouter } from 'react-router';
import { Toaster } from 'sonner';
import './index.css';
import { APP_BASE } from '@/lib/api';
import { initTheme } from '@/lib/theme';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppShell } from '@/components/AppShell';
import { OverviewPage } from '@/pages/Overview';
import { Skeleton } from '@/components/ui/misc';

const ActivityPage = lazy(() => import('@/pages/Activity').then((m) => ({ default: m.ActivityPage })));
const AutomationsPage = lazy(() => import('@/pages/Automations').then((m) => ({ default: m.AutomationsPage })));
const SettingsPage = lazy(() => import('@/pages/Settings').then((m) => ({ default: m.SettingsPage })));

function Page({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

initTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, refetchOnWindowFocus: true, retry: 1 },
  },
});

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <AppShell />,
      children: [
        { index: true, element: <OverviewPage /> },
        { path: 'activity', element: <Page><ActivityPage /></Page> },
        { path: 'automations', element: <Page><AutomationsPage /></Page> },
        { path: 'automations/:id', element: <Page><AutomationsPage /></Page> },
        { path: 'settings', element: <Page><SettingsPage /></Page> },
        { path: '*', element: <OverviewPage /> },
      ],
    },
  ],
  { basename: APP_BASE },
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
        <Toaster position="bottom-right" toastOptions={{ className: 'font-sans' }} richColors closeButton />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
