import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const InstallPWA = () => {
    const { t } = useTranslation();
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [showInstallModal, setShowInstallModal] = useState(false);
    const [isInstalling, setIsInstalling] = useState(false);
    const [isIOS, setIsIOS] = useState(false);
    const [isStandalone, setIsStandalone] = useState(false);
    const [isPWAInstallable, setIsPWAInstallable] = useState(false);
    const [hasUserDismissed, setHasUserDismissed] = useState(false);
    const [isEdge, setIsEdge] = useState(false);

    useEffect(() => {
        // Detectar plataforma y navegador
        const userAgent = navigator.userAgent;
        const isIOSDevice = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
        const isEdgeBrowser = /Edge/.test(userAgent);
        const isAndroidDevice = /Android/.test(userAgent);
        const isEdgeMobile = isEdgeBrowser && (isAndroidDevice || isIOSDevice);
        const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || 
                                window.navigator.standalone === true;
        
        setIsIOS(isIOSDevice);
        setIsEdge(isEdgeMobile); // Solo Edge móvil
        setIsStandalone(isStandaloneMode);

        // Si ya está instalada, no mostrar nada
        if (isStandaloneMode) {
            return;
        }

        // Verificar si ya hay un prompt disponible globalmente
        if (window.deferredPrompt) {
            setDeferredPrompt(window.deferredPrompt);
            setIsPWAInstallable(true);
            // Mostrar modal después de un delay
            setTimeout(() => {
                if (!hasUserDismissed) {
                    setShowInstallModal(true);
                }
            }, 3000);
        }

        // Capturar el evento beforeinstallprompt
        const handleBeforeInstallPrompt = (e) => {
            console.log('🎯 beforeinstallprompt event fired');
            
            // Prevenir que el navegador muestre el prompt automático
            e.preventDefault();
            
            // Guardar el evento
            setDeferredPrompt(e);
            window.deferredPrompt = e;
            setIsPWAInstallable(true);
            
            // Mostrar nuestro modal después de un delay
            setTimeout(() => {
                if (!hasUserDismissed) {
                    setShowInstallModal(true);
                }
            }, 3000);
        };

        // Para iOS, mostrar instrucciones manuales
        if (isIOSDevice && !isStandaloneMode) {
            console.log('🍎 iOS detectado, mostrando instrucciones manuales');
            setTimeout(() => {
                if (!hasUserDismissed) {
                    setShowInstallModal(true);
                }
            }, 4000);
        }

        // Para Edge móvil, mostrar instrucciones manuales (Edge móvil no soporta beforeinstallprompt)
        if (isEdgeMobile && !isStandaloneMode) {
            console.log('🔗 Edge móvil detectado, mostrando instrucciones manuales');
            setTimeout(() => {
                if (!hasUserDismissed) {
                    setShowInstallModal(true);
                }
            }, 2000);
        }

        // Para otros navegadores, verificar si la PWA es instalable
        if (!isIOSDevice && !isEdgeMobile && !isStandaloneMode) {
            // Verificar criterios básicos de instalación
            const checkInstallability = async () => {
                try {
                    // Verificar Service Worker
                    if ('serviceWorker' in navigator) {
                        const registration = await navigator.serviceWorker.getRegistration();
                        if (registration) {
                            // Verificar manifest
                            const manifestResponse = await fetch('/manifest.json');
                            if (manifestResponse.ok) {
                                const manifest = await manifestResponse.json();
                                const hasValidManifest = manifest.name && manifest.short_name && manifest.icons && manifest.icons.length > 0;
                                
                                if (hasValidManifest) {
                                    setIsPWAInstallable(true);
                                    // Si no hay deferredPrompt después de 5 segundos, mostrar instrucciones manuales
                                    setTimeout(() => {
                                        if (!deferredPrompt && !hasUserDismissed) {
                                            setShowInstallModal(true);
                                        }
                                    }, 5000);
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error verificando instalabilidad:', error);
                }
            };
            
            checkInstallability();
        }

        // Escuchar el evento beforeinstallprompt
        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) {
            console.log('❌ No hay deferredPrompt disponible');
            return;
        }

        setIsInstalling(true);
        console.log('🚀 Iniciando instalación...');

        try {
            // Mostrar el prompt de instalación
            deferredPrompt.prompt();

            // Esperar la respuesta del usuario
            const { outcome } = await deferredPrompt.userChoice;

            if (outcome === 'accepted') {
                console.log('✅ Usuario aceptó instalar la PWA');
                setShowInstallModal(false);
                setDeferredPrompt(null);
                window.deferredPrompt = null;
            } else {
                console.log('❌ Usuario rechazó instalar la PWA');
            }
        } catch (error) {
            console.error('Error al instalar PWA:', error);
        } finally {
            setIsInstalling(false);
        }
    };

    const handleEdgeInstallClick = () => {
        console.log('🔗 Edge móvil: Cerrando modal con instrucciones');
        // Para Edge móvil, simplemente cerramos el modal ya que las instrucciones están visibles
        setShowInstallModal(false);
        setHasUserDismissed(true);
    };

    const handleDismiss = () => {
        console.log('❌ Usuario cerró el modal');
        setShowInstallModal(false);
        setHasUserDismissed(true);
        
        // Limpiar el prompt si existe
        if (deferredPrompt) {
            setDeferredPrompt(null);
            window.deferredPrompt = null;
        }
        
        // Permitir que aparezca de nuevo después de 30 segundos
        setTimeout(() => {
            setHasUserDismissed(false);
        }, 30000);
    };

    // No mostrar nada si ya está instalada o fue cerrada recientemente
    if (isStandalone || hasUserDismissed || !showInstallModal) {
        return null;
    }

    return (
        <>
            {/* Debug Panel - Solo en desarrollo */}
            {import.meta.env.DEV && (
                <div className="fixed top-4 right-4 bg-black bg-opacity-75 text-white p-4 rounded-lg text-xs max-w-xs z-50">
                    <h4 className="font-bold mb-2">🔧 InstallPWA Debug</h4>
                    <div className="space-y-1">
                        <div>📱 iOS: {isIOS ? 'Sí' : 'No'}</div>
                        <div>🔗 Edge: {isEdge ? 'Sí' : 'No'}</div>
                        <div>📦 Standalone: {isStandalone ? 'Sí' : 'No'}</div>
                        <div>✅ Installable: {isPWAInstallable ? 'Sí' : 'No'}</div>
                        <div>🎯 DeferredPrompt: {deferredPrompt ? 'Sí' : 'No'}</div>
                        <div>📋 ShowModal: {showInstallModal ? 'Sí' : 'No'}</div>
                        <div>🚫 Dismissed: {hasUserDismissed ? 'Sí' : 'No'}</div>
                    </div>
                    <button 
                        onClick={() => setShowInstallModal(true)}
                        className="mt-2 bg-blue-600 px-2 py-1 rounded text-xs"
                    >
                        Forzar Modal
                    </button>
                </div>
            )}

            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
                    <div className="text-center">
                        {/* Icono */}
                        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-indigo-100 dark:bg-indigo-900 mb-4">
                            <svg className="h-8 w-8 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                        </div>

                        {/* Título */}
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                            Instalar FinanzApp
                        </h3>

                        {/* Descripción */}
                        <p className="text-gray-600 dark:text-gray-300 mb-6">
                            Instala FinanzApp en tu dispositivo para acceder más rápido y usar la app sin conexión.
                        </p>

                        {/* Contenido específico por plataforma */}
                        {isIOS ? (
                            <div className="space-y-4">
                                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                                    <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
                                        📱 Instrucciones para iOS:
                                    </h4>
                                    <ol className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                                        <li>1. Toca el botón <strong>Compartir</strong> 📤</li>
                                        <li>2. Selecciona <strong>"Agregar a Pantalla de Inicio"</strong></li>
                                        <li>3. Toca <strong>"Agregar"</strong> para confirmar</li>
                                    </ol>
                                </div>
                                
                                <button
                                    onClick={handleDismiss}
                                    className="w-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-medium py-2 px-4 rounded-lg transition-colors duration-200"
                                >
                                    Entendido
                                </button>
                            </div>
                        ) : isEdge ? (
                            <div className="space-y-4">
                                <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
                                    <h4 className="font-semibold text-purple-800 dark:text-purple-200 mb-2">
                                        🔗 Instalación en Microsoft Edge (Móvil):
                                    </h4>
                                    <p className="text-sm text-purple-700 dark:text-purple-300 mb-3">
                                        Edge móvil tiene una instalación especial. Haz clic en "Instalar" para activar el prompt nativo de Edge.
                                    </p>
                                </div>
                                
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <button
                                        onClick={handleEdgeInstallClick}
                                        disabled={isInstalling}
                                        className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
                                    >
                                        {isInstalling ? (
                                            <>
                                                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                Activando...
                                            </>
                                        ) : (
                                            <>
                                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                                </svg>
                                                                                                 Entendido
                                            </>
                                        )}
                                    </button>

                                    <button
                                        onClick={handleDismiss}
                                        className="flex-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-medium py-2 px-4 rounded-lg transition-colors duration-200"
                                    >
                                        Más tarde
                                    </button>
                                </div>

                                {/* Instrucciones específicas para Edge móvil */}
                                <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
                                    <h4 className="font-semibold text-purple-800 dark:text-purple-200 mb-2">
                                        🔗 Instalación en Edge Móvil:
                                    </h4>
                                    <p className="text-sm text-purple-700 dark:text-purple-300 mb-3">
                                        Edge móvil requiere instalación manual desde el menú del navegador.
                                    </p>
                                    <ol className="text-sm text-purple-700 dark:text-purple-300 space-y-1">
                                        <li>1. Toca el menú (⋮) en la esquina superior derecha</li>
                                        <li>2. Selecciona <strong>"Aplicaciones"</strong></li>
                                        <li>3. Toca <strong>"Instalar aplicación"</strong></li>
                                        <li>4. Confirma la instalación</li>
                                    </ol>
                                </div>
                            </div>
                        ) : deferredPrompt ? (
                            <>
                                {/* Botones para navegadores que soportan beforeinstallprompt */}
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <button
                                        onClick={handleInstallClick}
                                        disabled={isInstalling}
                                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
                                    >
                                        {isInstalling ? (
                                            <>
                                                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                Instalando...
                                            </>
                                        ) : (
                                            <>
                                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                                </svg>
                                                Instalar
                                            </>
                                        )}
                                    </button>

                                    <button
                                        onClick={handleDismiss}
                                        className="flex-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-medium py-2 px-4 rounded-lg transition-colors duration-200"
                                    >
                                        Más tarde
                                    </button>
                                </div>

                                {/* Información adicional */}
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
                                    Puedes instalar la app desde el menú del navegador en cualquier momento.
                                </p>
                            </>
                        ) : (
                            // Instrucciones manuales para otros casos
                            <div className="space-y-4">
                                <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg">
                                    <h4 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
                                        📱 Instalación disponible:
                                    </h4>
                                    <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
                                        Esta app se puede instalar en tu dispositivo. Busca la opción de instalación en el menú del navegador.
                                    </p>
                                    <ol className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                                        <li>1. Toca el menú (⋮) en la esquina superior derecha</li>
                                        <li>2. Selecciona <strong>"Instalar aplicación"</strong></li>
                                        <li>3. Confirma la instalación</li>
                                    </ol>
                                </div>
                                
                                <button
                                    onClick={handleDismiss}
                                    className="w-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-medium py-2 px-4 rounded-lg transition-colors duration-200"
                                >
                                    Entendido
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

export default InstallPWA;
