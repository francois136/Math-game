import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles.css';

const racine = document.getElementById('racine');
if (racine === null) throw new Error('#racine est absent de la page');

createRoot(racine).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
