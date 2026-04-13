import React from 'react';
import ReactDOM from 'react-dom/client';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConnectKitProvider } from 'connectkit';

import { wagmiConfig } from '@/lib/wagmiConfig';
import { App } from './App';
import './index.css';


// TanStack Query client
// REASON: Wagmi v2 delegates all server state (balances, receipts, etc.) to
// TanStack Query. We configure a generous staleTime to avoid hammering RPCs
// during rapid re-renders, while keepPreviousData prevents flicker.

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,      // 10 seconds before refetch
      gcTime: 5 * 60_000,     // 5 minutes before garbage collection
      retry: 2,
      refetchOnWindowFocus: false, // Avoid RPC spam on tab switch
    },
  },
});


const connectKitTheme = {
  '--ck-font-family': '"DM Sans", system-ui, sans-serif',
  '--ck-border-radius': '16px',
  '--ck-overlay-background': 'rgba(0, 0, 0, 0.75)',
} as React.CSSProperties;

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found in DOM');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <ConnectKitProvider
          customTheme={connectKitTheme}
          theme="midnight"
          options={{
            hideBalance: false,
            hideTooltips: false,
            enforceSupportedChains: false,
          }}
        >
          <App />
        </ConnectKitProvider>
      </WagmiProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
