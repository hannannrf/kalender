import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { registerServiceWorker } from './push';
import { SessionProvider } from './session';
import { applyTheme, savedTheme } from './theme';
import './styles/tokens.css';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <App />
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
);

registerServiceWorker();
applyTheme(savedTheme()); // browser bar colour for a saved Light or Dark choice
