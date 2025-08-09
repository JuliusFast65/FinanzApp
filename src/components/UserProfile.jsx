import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { getUserPatternStats } from '../utils/userCategoryPatterns';

const UserProfile = ({ db, user, appId }) => {
    const { t } = useTranslation();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setSaving] = useState(false);
    const [userSettings, setUserSettings] = useState({
        defaultAI: 'openai',
        enableNotifications: true,
        autoCategorizationDelay: 2000,
        theme: 'auto'
    });
    const [userStats, setUserStats] = useState({
        totalPatterns: 0,
        totalUsage: 0,
        mostUsedPatterns: []
    });
    const [notification, setNotification] = useState({
        show: false,
        type: 'success',
        message: ''
    });

    useEffect(() => {
        if (db && user && appId) {
            loadUserProfile();
            loadUserStats();
        }
    }, [db, user, appId]);

    const loadUserProfile = async () => {
        try {
            setIsLoading(true);
            const userDoc = doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'settings');
            const docSnap = await getDoc(userDoc);
            
            if (docSnap.exists()) {
                const data = docSnap.data();
                setUserSettings(prevSettings => ({
                    ...prevSettings,
                    ...data
                }));
                console.log('Configuraciones de usuario cargadas:', data);
            } else {
                // Primera vez - crear configuración por defecto
                await setDoc(userDoc, userSettings);
                console.log('Configuración por defecto creada');
            }
        } catch (error) {
            console.error('Error cargando perfil de usuario:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const loadUserStats = async () => {
        try {
            const stats = await getUserPatternStats(db, user.uid, appId);
            setUserStats(stats);
        } catch (error) {
            console.error('Error cargando estadísticas:', error);
        }
    };

    const saveUserSettings = async () => {
        try {
            setSaving(true);
            const userDoc = doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'settings');
            await updateDoc(userDoc, {
                ...userSettings,
                lastUpdated: new Date()
            });
            
            showNotification('success', 'Configuración guardada exitosamente');
        } catch (error) {
            console.error('Error guardando configuración:', error);
            showNotification('error', 'Error al guardar la configuración');
        } finally {
            setSaving(false);
        }
    };

    const showNotification = (type, message) => {
        setNotification({ show: true, type, message });
        setTimeout(() => {
            setNotification(prev => ({ ...prev, show: false }));
        }, 3000);
    };

    const handleSettingChange = (key, value) => {
        setUserSettings(prev => ({
            ...prev,
            [key]: value
        }));
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
                <span className="ml-3">Cargando perfil...</span>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-6">
            {/* Header */}
            <div className="mb-8">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                    Perfil de Usuario
                </h2>
                <p className="text-gray-600 dark:text-gray-300">
                    Gestiona tus configuraciones y preferencias de FinanzApp
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Información del Usuario */}
                <div className="lg:col-span-1">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            Información de la Cuenta
                        </h3>
                        
                        <div className="space-y-4">
                            <div className="flex items-center space-x-3">
                                <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="font-medium text-gray-900 dark:text-white">
                                        {user.displayName || user.email}
                                    </p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                        {user.email}
                                    </p>
                                </div>
                            </div>

                            <div className="border-t pt-4">
                                <h4 className="font-medium text-gray-900 dark:text-white mb-3">
                                    Estadísticas de Uso
                                </h4>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-600 dark:text-gray-400">Patrones Personalizados:</span>
                                        <span className="font-medium text-gray-900 dark:text-white">
                                            {userStats.totalPatterns}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600 dark:text-gray-400">Usos Totales:</span>
                                        <span className="font-medium text-gray-900 dark:text-white">
                                            {userStats.totalUsage}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Top patrones */}
                            {userStats.mostUsedPatterns.length > 0 && (
                                <div className="border-t pt-4">
                                    <h4 className="font-medium text-gray-900 dark:text-white mb-3">
                                        Patrones Más Usados
                                    </h4>
                                    <div className="space-y-2">
                                        {userStats.mostUsedPatterns.slice(0, 3).map((pattern, index) => (
                                            <div key={pattern.id} className="flex justify-between text-xs">
                                                <span className="text-gray-600 dark:text-gray-400 truncate">
                                                    {pattern.originalDescription}
                                                </span>
                                                <span className="text-gray-500 ml-2">
                                                    {pattern.timesUsed}x
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Configuraciones */}
                <div className="lg:col-span-2">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                                Configuraciones
                            </h3>
                            <button
                                onClick={saveUserSettings}
                                disabled={isSaving}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                            >
                                {isSaving && (
                                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                )}
                                <span>Guardar Cambios</span>
                            </button>
                        </div>

                        <div className="space-y-6">
                            {/* IA por Defecto */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                                    Inteligencia Artificial por Defecto
                                </label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <button
                                        onClick={() => handleSettingChange('defaultAI', 'openai')}
                                        className={`p-4 rounded-lg border-2 transition-all text-left ${
                                            userSettings.defaultAI === 'openai'
                                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                                : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <h4 className="font-semibold text-gray-900 dark:text-white">
                                                🤖 OpenAI GPT-4o
                                            </h4>
                                            <div className={`w-4 h-4 rounded-full ${
                                                userSettings.defaultAI === 'openai' ? 'bg-blue-500' : 'bg-gray-300'
                                            }`}></div>
                                        </div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">
                                            Mayor cuota, más confiable para desarrollo
                                        </p>
                                        <div className="mt-2 text-xs text-green-600 dark:text-green-400">
                                            ✅ Recomendado para desarrollo
                                        </div>
                                    </button>

                                    <button
                                        onClick={() => handleSettingChange('defaultAI', 'gemini')}
                                        className={`p-4 rounded-lg border-2 transition-all text-left ${
                                            userSettings.defaultAI === 'gemini'
                                                ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                                                : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <h4 className="font-semibold text-gray-900 dark:text-white">
                                                🧠 Gemini 1.5 Flash
                                            </h4>
                                            <div className={`w-4 h-4 rounded-full ${
                                                userSettings.defaultAI === 'gemini' ? 'bg-green-500' : 'bg-gray-300'
                                            }`}></div>
                                        </div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">
                                            Gratuito, ideal para uso casual
                                        </p>
                                        <div className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                                            💡 15 requests/min, 1500/día
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {/* Delay de Categorización */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                                    Delay entre Categorizaciones de IA (milisegundos)
                                </label>
                                <div className="flex items-center space-x-4">
                                    <input
                                        type="range"
                                        min="500"
                                        max="5000"
                                        step="500"
                                        value={userSettings.autoCategorizationDelay}
                                        onChange={(e) => handleSettingChange('autoCategorizationDelay', parseInt(e.target.value))}
                                        className="flex-1"
                                    />
                                    <span className="text-sm font-medium text-gray-900 dark:text-white min-w-20">
                                        {userSettings.autoCategorizationDelay}ms
                                    </span>
                                </div>
                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                    Mayor delay = menos errores de cuota. Recomendado: 2000ms para Gemini, 1000ms para OpenAI
                                </p>
                            </div>

                            {/* Notificaciones */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                                    Notificaciones
                                </label>
                                <div className="space-y-3">
                                    <label className="flex items-center">
                                        <input
                                            type="checkbox"
                                            checked={userSettings.enableNotifications}
                                            onChange={(e) => handleSettingChange('enableNotifications', e.target.checked)}
                                            className="rounded border-gray-300 text-green-600 shadow-sm focus:border-green-300 focus:ring focus:ring-green-200 focus:ring-opacity-50"
                                        />
                                        <span className="ml-3 text-sm text-gray-700 dark:text-gray-300">
                                            Mostrar notificaciones de análisis completado
                                        </span>
                                    </label>
                                </div>
                            </div>

                            {/* Tema */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                                    Tema de la Aplicación
                                </label>
                                <select
                                    value={userSettings.theme}
                                    onChange={(e) => handleSettingChange('theme', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white"
                                >
                                    <option value="auto">🌓 Automático (según sistema)</option>
                                    <option value="light">☀️ Claro</option>
                                    <option value="dark">🌙 Oscuro</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Notificación */}
            {notification.show && (
                <div className="fixed top-4 right-4 z-50 max-w-sm">
                    <div className={`rounded-lg shadow-lg p-4 ${
                        notification.type === 'success' 
                            ? 'bg-green-50 border border-green-200' 
                            : 'bg-red-50 border border-red-200'
                    }`}>
                        <div className="flex items-center">
                            <div className="flex-shrink-0">
                                {notification.type === 'success' ? (
                                    <svg className="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                ) : (
                                    <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                    </svg>
                                )}
                            </div>
                            <div className="ml-3">
                                <p className={`text-sm font-medium ${
                                    notification.type === 'success' ? 'text-green-800' : 'text-red-800'
                                }`}>
                                    {notification.message}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserProfile;
