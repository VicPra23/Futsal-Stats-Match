import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Registra el Service Worker para que funcione sin conexión a internet
const updateSW = registerSW({
  onNeedRefresh() {
    // Aquí se podría mostrar un mensaje al usuario para actualizar
  },
  onOfflineReady() {
    console.log('App lista para funcionar sin conexión');
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
