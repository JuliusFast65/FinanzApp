import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './i18n/index.js'

// Función para manejar el registro y actualizaciones del Service Worker
const registerServiceWorker = async () => {
  if ('serviceWorker' in navigator) {
    try {
      // Verificar si ya hay un Service Worker registrado
      const existingRegistration = await navigator.serviceWorker.getRegistration();
      
      if (existingRegistration) {
        console.log('Service Worker ya registrado con scope:', existingRegistration.scope);
        
        // Verificar si hay una nueva versión
        await existingRegistration.update();
        return existingRegistration;
      }

      // Registrar nuevo Service Worker
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none' // Siempre verificar actualizaciones
      });
      
      console.log('Service Worker registrado con scope:', registration.scope);

      // Detectar actualizaciones
      registration.addEventListener('updatefound', () => {
        console.log('[SW] Nueva versión detectada');
        const newWorker = registration.installing;
        
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[SW] Nueva versión instalada, lista para activar');
            
            // Notificar a la aplicación que hay una actualización disponible
            window.dispatchEvent(new CustomEvent('swUpdateAvailable'));
          }
        });
      });

      // Manejar cuando el Service Worker toma control
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[SW] Nuevo Service Worker tomó control');
        
        // Recargar la página para aplicar la nueva versión
        window.location.reload();
      });

      // Manejar errores del Service Worker
      navigator.serviceWorker.addEventListener('error', (error) => {
        console.error('[SW] Error en Service Worker:', error);
      });

      return registration;
    } catch (error) {
      console.error('Error registrando el Service Worker:', error);
    }
  } else {
    console.log('Service Worker no soportado en este navegador');
  }
};

// Registrar el Service Worker cuando la página cargue
window.addEventListener('load', () => {
  // Pequeño delay para asegurar que la página esté completamente cargada
  setTimeout(registerServiceWorker, 100);
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
