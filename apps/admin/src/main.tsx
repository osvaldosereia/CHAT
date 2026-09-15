import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createBrowserSupabaseClient } from './lib/supabase';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found');
}

let client;

try {
  client = createBrowserSupabaseClient({
    url: import.meta.env.VITE_SUPABASE_URL ?? '',
    publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
  });
} catch {
  client = undefined;
}

createRoot(root).render(
  <StrictMode>
    <App client={client} />
  </StrictMode>,
);
