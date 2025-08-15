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
        // console.log('Service Worker ya registrado con scope:', existingRegistration.scope);
        
        // Verificar si hay una nueva versión disponible
        existingRegistration.addEventListener('updatefound', () => {
          const newWorker = existingRegistration.installing;
          
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // console.log('[SW] Nueva versión detectada');
              
              // Mostrar notificación de actualización
              if (confirm('Hay una nueva versión disponible. ¿Quieres actualizar ahora?')) {
                newWorker.postMessage({ type: 'SKIP_WAITING' });
              }
            } else if (newWorker.state === 'activated') {
              // console.log('[SW] Nueva versión instalada, lista para activar');
              
              // Recargar la página para activar la nueva versión
              window.location.reload();
            }
          });
        });
        
        // Escuchar cambios de estado del Service Worker
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          // console.log('[SW] Nuevo Service Worker tomó control');
        });
      } else {
        // Registrar nuevo Service Worker
        try {
          const registration = await navigator.serviceWorker.register('/sw.js', {
            scope: '/'
          });
          
          // console.log('Service Worker registrado con scope:', registration.scope);
          
          // Escuchar actualizaciones
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // console.log('[SW] Nueva versión detectada');
                
                if (confirm('Hay una nueva versión disponible. ¿Quieres actualizar ahora?')) {
                  newWorker.postMessage({ type: 'SKIP_WAITING' });
                }
              } else if (newWorker.state === 'activated') {
                // console.log('[SW] Nueva versión instalada, lista para activar');
                window.location.reload();
              }
            });
          });
          
          // Escuchar cambios de estado
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            // console.log('[SW] Nuevo Service Worker tomó control');
          });
          
        } catch (error) {
          console.error('Error registrando el Service Worker:', error);
        }
      }
    } catch (error) {
      console.error('Error registrando el Service Worker:', error);
    }
  } else {
    // console.log('Service Worker no soportado en este navegador');
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
