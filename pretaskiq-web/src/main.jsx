import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import './styles/index.css';
import App from './App.jsx';
import { installApiClient } from './api/client.js';
import { bootLegacyApp } from './legacy/boot.js';

// 1. Point the prototype's AI calls at our own proxy (and add the access code to them).
installApiClient();

// 2. Render the React shell synchronously so the prototype's markup is in the page...
const root = createRoot(document.getElementById('app-shell'));
flushSync(() => root.render(<App />));

// 3. ...then start the prototype's scripts, exactly as the single HTML file did.
bootLegacyApp();
