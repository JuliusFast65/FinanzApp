import React from 'react';
import { useTranslation } from 'react-i18next';
import useLanguage from '../hooks/useLanguage';

const LanguageSelector = ({ userPrefs, onUpdateUserPrefs, currentTheme = 'dark', showFullNames = false }) => {
    const { t } = useTranslation();
    const { currentLanguage, changeLanguage, availableLanguages } = useLanguage(userPrefs, onUpdateUserPrefs);

    const handleLanguageChange = (e) => {
        const newLanguage = e.target.value;
        changeLanguage(newLanguage);
    };

    return (
        <div className="flex items-center gap-2">
            {!showFullNames && (
                <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className="h-4 w-4 text-gray-400" 
                    viewBox="0 0 20 20" 
                    fill="currentColor"
                >
                    <path 
                        fillRule="evenodd" 
                        d="M7 2a1 1 0 011 1v1h3a1 1 0 110 2H9.578a18.87 18.87 0 01-1.724 4.674c-.29.61-.373 1.25-.275 1.85a17.163 17.163 0 005.638 0c.098-.6.014-1.24-.275-1.85A18.867 18.867 0 0110.422 7H13a1 1 0 110-2h-3V3a1 1 0 10-2 0v1H8a1 1 0 100 2h1.422a18.87 18.87 0 001.724 4.674c.29.61.373 1.25.275 1.85a17.163 17.163 0 01-5.638 0c-.098-.6-.014-1.24.275-1.85A18.867 18.867 0 008.578 7H7a1 1 0 100-2h1V3a1 1 0 00-1-1z" 
                        clipRule="evenodd" 
                    />
                </svg>
            )}
            <select
                value={currentLanguage}
                onChange={handleLanguageChange}
                className={`rounded p-1 border text-xs min-w-0 ${
                    currentTheme === 'dark' 
                        ? 'bg-gray-700 border-gray-600 text-white' 
                        : 'bg-white border-gray-300 text-gray-900'
                }`}
                style={showFullNames ? {minWidth: '120px'} : {maxWidth:'80px'}}
            >
                {availableLanguages.map(lang => (
                    <option key={lang.code} value={lang.code}>
                        {showFullNames ? `${lang.flag} ${lang.name}` : `${lang.flag} ${lang.code.toUpperCase()}`}
                    </option>
                ))}
            </select>
        </div>
    );
};

export default LanguageSelector; 