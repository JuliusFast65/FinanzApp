// Configuración centralizada de versiones
export const APP_VERSION = '1.0';
export const PACKAGE_VERSION = '1.0.0';

// Función para obtener la versión formateada para mostrar
export const getDisplayVersion = () => `V ${APP_VERSION}`;

// Función para obtener la versión completa (con patch)
export const getFullVersion = () => PACKAGE_VERSION; 