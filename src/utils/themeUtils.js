// Utilidades para el manejo de temas

// Configuración de colores para modo claro y oscuro
export const themeColors = {
    dark: {
        primary: {
            bg: 'bg-gray-900',
            text: 'text-white',
            border: 'border-gray-700',
            hover: 'hover:bg-gray-800',
            focus: 'focus:ring-indigo-500',
            button: 'bg-indigo-600 hover:bg-indigo-700',
            buttonSecondary: 'bg-gray-700 hover:bg-gray-600',
            input: 'bg-gray-700 border-gray-600 text-white',
            modal: 'bg-gray-800',
            card: 'bg-gray-800',
            accent: 'bg-indigo-600',
            accentHover: 'hover:bg-indigo-700'
        },
        secondary: {
            bg: 'bg-gray-800',
            text: 'text-gray-300',
            border: 'border-gray-600',
            hover: 'hover:bg-gray-700'
        },
        text: {
            primary: 'text-white',
            secondary: 'text-gray-300',
            muted: 'text-gray-400',
            accent: 'text-indigo-400'
        }
    },
    light: {
        primary: {
            bg: 'bg-white',
            text: 'text-gray-900',
            border: 'border-gray-200',
            hover: 'hover:bg-gray-50',
            focus: 'focus:ring-indigo-500',
            button: 'bg-indigo-600 hover:bg-indigo-700',
            buttonSecondary: 'bg-gray-200 hover:bg-gray-300',
            input: 'bg-white border-gray-300 text-gray-900',
            modal: 'bg-white',
            card: 'bg-white',
            accent: 'bg-indigo-600',
            accentHover: 'hover:bg-indigo-700'
        },
        secondary: {
            bg: 'bg-gray-50',
            text: 'text-gray-700',
            border: 'border-gray-200',
            hover: 'hover:bg-gray-100'
        },
        text: {
            primary: 'text-gray-900',
            secondary: 'text-gray-700',
            muted: 'text-gray-500',
            accent: 'text-indigo-600'
        }
    }
};

// Obtener colores del tema actual
export const getThemeColors = (isDark = true) => {
    return isDark ? themeColors.dark : themeColors.light;
};

// Clases CSS comunes para componentes
export const componentClasses = {
    // Botones
    button: {
        primary: (isDark) => `${getThemeColors(isDark).primary.button} text-white font-semibold py-2 px-4 rounded-lg transition-colors`,
        secondary: (isDark) => `${getThemeColors(isDark).primary.buttonSecondary} text-gray-900 font-semibold py-2 px-4 rounded-lg transition-colors`,
        outline: (isDark) => `border ${getThemeColors(isDark).primary.border} ${getThemeColors(isDark).text.primary} font-semibold py-2 px-4 rounded-lg transition-colors hover:bg-opacity-10`
    },
    
    // Inputs
    input: (isDark) => `w-full px-3 py-2 ${getThemeColors(isDark).primary.input} rounded-md focus:ring-2 ${getThemeColors(isDark).primary.focus} focus:outline-none transition-colors`,
    
    // Modales
    modal: {
        overlay: 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4',
        content: (isDark) => `${getThemeColors(isDark).primary.modal} rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden shadow-xl`,
        header: (isDark) => `flex items-center justify-between p-6 border-b ${getThemeColors(isDark).primary.border}`,
        body: 'p-6 overflow-y-auto',
        footer: (isDark) => `flex justify-end gap-3 p-6 border-t ${getThemeColors(isDark).primary.border}`
    },
    
    // Cards
    card: (isDark) => `${getThemeColors(isDark).primary.card} rounded-lg shadow-lg border ${getThemeColors(isDark).primary.border}`,
    
    // Tabs
    tab: {
        base: 'px-4 py-2 text-sm font-medium rounded-t-lg transition-colors duration-200',
        active: (isDark) => isDark ? 'bg-indigo-600 text-white' : 'bg-indigo-600 text-white',
        inactive: (isDark) => isDark ? 'bg-gray-700 text-gray-400 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
    }
};

// Función para aplicar tema a un elemento específico
export const applyThemeToElement = (element, isDark) => {
    if (!element) return;
    
    const colors = getThemeColors(isDark);
    
    // Aplicar clases base
    element.classList.add(colors.primary.bg, colors.text.primary);
    
    // Remover clases del tema opuesto
    const oppositeColors = getThemeColors(!isDark);
    element.classList.remove(oppositeColors.primary.bg, oppositeColors.text.primary);
};

// Función para detectar si el sistema prefiere tema oscuro
export const prefersDarkMode = () => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

// Función para obtener el tema efectivo basado en preferencias
export const getEffectiveTheme = (userPreference, systemTheme) => {
    switch (userPreference) {
        case 'light':
            return 'light';
        case 'dark':
            return 'dark';
        case 'auto':
            return systemTheme;
        default:
            return 'dark';
    }
};

// Función para inicializar el tema en el documento
export const initializeTheme = (theme) => {
    const root = document.documentElement;
    
    // Remover clases existentes
    root.classList.remove('dark', 'light');
    
    // Aplicar tema
    if (theme === 'dark') {
        root.classList.add('dark');
    } else {
        root.classList.add('light');
    }
    
    // Guardar en localStorage
    localStorage.setItem('color-theme', theme);
}; 