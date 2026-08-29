import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider, MutationCache, keepPreviousData } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { AuthProvider } from './context/AuthContext.tsx'
import { AppConfigProvider } from './context/AppConfigContext.tsx'
import { CompanyProvider } from './context/CompanyContext.tsx'

import ErrorBoundary from './components/ErrorBoundary'
import './index.css'
import App from './App.tsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      placeholderData: keepPreviousData,
    },
    mutations: { retry: 0 },
  },
  mutationCache: new MutationCache({
    onSuccess: () => {},
    onError: (error) => {
      const err = error as { response?: { data?: { detail?: string; message?: string } }; message?: string };
      const errorMessage = err?.response?.data?.detail || err?.response?.data?.message || err?.message || 'An error occurred';
      toast.error(errorMessage);
    }
  })
})

const renderApp = () => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <CompanyProvider>
            <AppConfigProvider>
              <ErrorBoundary>
                <App />
              </ErrorBoundary>
            </AppConfigProvider>
          </CompanyProvider>
        </AuthProvider>
      </QueryClientProvider>
    </StrictMode>,
  )
}

if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js')
    })
  } else {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (let registration of registrations) {
        registration.unregister();
      }
    });
  }
}

renderApp()
