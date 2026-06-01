import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'
import { initCsrf } from './api/client'

// Prime the CSRF cookie on app load so all mutations work
initCsrf().catch(() => {})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 3,   // 3 min — avoid redundant refetches on nav
      gcTime:    1000 * 60 * 10,  // keep cache 10 min
      retry: 1,
      refetchOnWindowFocus: false, // don't blast API every tab-switch
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
)
