import { useState, useEffect, useCallback } from 'react';

const useTheme = (userPrefs = {}) => {
    const [currentTheme, setCurrentTheme] = useState('dark');
    const [systemTheme, setSystemTheme] = useState('dark');

    // Aplicar tema al documento
    const applyTheme = useCallback((theme) => {
        const root = document.documentElement;
        
        if (theme === 'dark') {
            root.classList.add('dark');
            root.classList.remove('light');
        } else {
            root.classList.remove('dark');
            root.classList.add('light');
        }
        
        // Guardar en localStorage para persistencia
        localStorage.setItem('color-theme', theme);
    }, []);

    // Determinar qué tema aplicar basado en las preferencias
    const getEffectiveTheme = useCallback((preference) => {
        switch (preference) {
            case 'light':
                return 'light';
            case 'dark':
                return 'dark';
            case 'auto':
                return systemTheme;
            default:
                return 'dark'; // Fallback
        }
    }, [systemTheme]);

    // Detectar tema del sistema
    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        
        const handleSystemThemeChange = (e) => {
            setSystemTheme(e.matches ? 'dark' : 'light');
        };

        // Establecer tema inicial del sistema
        setSystemTheme(mediaQuery.matches ? 'dark' : 'light');
        
        // Escuchar cambios en el tema del sistema
        mediaQuery.addEventListener('change', handleSystemThemeChange);
        
        return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
    }, []);

    // Inicializar tema al cargar
    useEffect(() => {
        const savedTheme = localStorage.getItem('color-theme');
        const userTheme = userPrefs.theme || savedTheme || 'dark';
        const effectiveTheme = getEffectiveTheme(userTheme);
        
        setCurrentTheme(effectiveTheme);
        applyTheme(effectiveTheme);
    }, [userPrefs.theme, getEffectiveTheme, applyTheme]);

    // Función para cambiar tema manualmente
    const setTheme = useCallback((theme) => {
        setCurrentTheme(theme);
        applyTheme(theme);
    }, [applyTheme]);

    return {
        currentTheme,
        systemTheme,
        setTheme,
        getEffectiveTheme: () => getEffectiveTheme(userPrefs.theme || 'dark')
    };
};

export default useTheme; 