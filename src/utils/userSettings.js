import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';

// Configuraciones por defecto
export const DEFAULT_USER_SETTINGS = {
    defaultAI: 'openai',
    enableNotifications: true,
    autoCategorizationDelay: 2000,
    theme: 'auto'
};

// Cargar configuraciones del usuario
export const loadUserSettings = async (db, userId, appId) => {
    try {
        const userDoc = doc(db, 'artifacts', appId, 'users', userId, 'profile', 'settings');
        const docSnap = await getDoc(userDoc);
        
        if (docSnap.exists()) {
            const settings = { ...DEFAULT_USER_SETTINGS, ...docSnap.data() };
            console.log('Configuraciones de los Settings del usuario cargadas:', settings);
            return settings;
        } else {
            console.log('No se encontraron configuraciones, usando por defecto');
            return DEFAULT_USER_SETTINGS;
        }
    } catch (error) {
        console.error('Error cargando configuraciones de usuario:', error);
        return DEFAULT_USER_SETTINGS;
    }
};

// Hook personalizado para usar configuraciones del usuario
export const useUserSettings = (db, user, appId) => {
    const [settings, setSettings] = useState(DEFAULT_USER_SETTINGS);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        console.log('🔍 [DEBUG] useUserSettings useEffect ejecutado:', { db: !!db, user: !!user, appId });
        
        if (db && user && appId) {
            console.log('🔍 [DEBUG] Cargando configuraciones para usuario:', user.uid);
            loadUserSettings(db, user.uid, appId)
                .then(userSettings => {
                    console.log('✅ [DEBUG] Configuraciones cargadas:', userSettings);
                    setSettings(userSettings);
                    setIsLoading(false);
                })
                .catch(error => {
                    console.error('❌ [DEBUG] Error en useUserSettings:', error);
                    setSettings(DEFAULT_USER_SETTINGS);
                    setIsLoading(false);
                });
        } else {
            console.log('⚠️ [DEBUG] useUserSettings: faltan parámetros:', { db: !!db, user: !!user, appId });
        }
    }, [db, user?.uid, appId]);

    console.log('🔍 [DEBUG] useUserSettings retornando:', { settings, isLoading });
    return { settings, isLoading };
};

export default {
    DEFAULT_USER_SETTINGS,
    loadUserSettings,
    useUserSettings
};
