import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const useLanguage = (userPrefs, onUpdateUserPrefs) => {
  const { i18n } = useTranslation();

  // Sincronizar idioma con las preferencias del usuario
  useEffect(() => {
    if (userPrefs?.language && i18n.language !== userPrefs.language) {
      i18n.changeLanguage(userPrefs.language);
    }
  }, [userPrefs?.language, i18n]);

  // Función para cambiar idioma
  const changeLanguage = (language) => {
    i18n.changeLanguage(language);
    
    // Actualizar preferencias del usuario si existe la función
    if (onUpdateUserPrefs) {
      onUpdateUserPrefs({ language });
    }
  };

  // Obtener idioma actual
  const currentLanguage = i18n.language;

  // Idiomas disponibles
  const availableLanguages = [
    { code: 'es', name: 'Español', flag: '🇪🇸' },
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'fr', name: 'Français', flag: '🇫🇷' }
  ];

  return {
    currentLanguage,
    changeLanguage,
    availableLanguages,
    t: i18n.t // Función de traducción
  };
};

export default useLanguage; 