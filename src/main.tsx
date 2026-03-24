import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import './index.css';

console.log("main.tsx executing...");
const rootElement = document.getElementById('root');
console.log("Root element found:", !!rootElement);

if (!rootElement) {
  const debug = document.getElementById('debug-info');
  if (debug) debug.innerText = "Error: Root element not found in DOM.";
  throw new Error("Failed to find the root element");
}

try {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  console.log("main.tsx: Render called successfully.");
} catch (error) {
  console.error("main.tsx: Render failed:", error);
  const debug = document.getElementById('debug-info');
  if (debug) debug.innerText = "Error during render: " + (error instanceof Error ? error.message : String(error));
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').then(registration => {
      console.log('SW registered: ', registration);
    }).catch(registrationError => {
      console.log('SW registration failed: ', registrationError);
    });
  });
}
