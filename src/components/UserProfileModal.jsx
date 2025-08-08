import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import LanguageSelector from './LanguageSelector';

const UserProfileModal = ({ isOpen, onClose, user, userPrefs, onUpdateUserPrefs, currentTheme = 'dark' }) => {
    const { t } = useTranslation();
    const [formData, setFormData] = useState({
        // Información Personal
        fullName: '',
        email: '',
        
        // Configuración Regional
        language: 'es',
        dateFormat: 'DD/MM/YYYY',
        timeFormat: '24h',
        
        // Preferencias Básicas
        theme: 'dark',
        
        // Notificaciones Básicas
        notifications: true,
        reminderTime: '09:00'
    });

    useEffect(() => {
        if (isOpen && user) {
            // Cargar datos del usuario
            setFormData(prev => ({
                ...prev,
                fullName: user.displayName || '',
                email: user.email || '',
                // Cargar preferencias existentes
                ...userPrefs
            }));
        }
    }, [isOpen, user, userPrefs]);

    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = async () => {
        try {
            await onUpdateUserPrefs(formData);
            onClose();
        } catch (error) {
            console.error('Error saving profile:', error);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className={`max-w-md w-full rounded-lg shadow-xl ${currentTheme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
                {/* Header */}
                <div className={`flex items-center justify-between p-6 border-b ${currentTheme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
                    <h2 className={`text-xl font-semibold ${currentTheme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                        Mi Perfil
                    </h2>
                    <button
                        onClick={onClose}
                        className={`${currentTheme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* Información Personal */}
                    <div>
                        <h3 className={`text-lg font-medium mb-4 ${currentTheme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                            Información Personal
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className={`block text-sm font-medium mb-2 ${currentTheme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                    Nombre Completo
                                </label>
                                <input
                                    type="text"
                                    value={formData.fullName}
                                    onChange={(e) => handleInputChange('fullName', e.target.value)}
                                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 ${
                                        currentTheme === 'dark' 
                                            ? 'bg-gray-700 border-gray-600 text-white' 
                                            : 'bg-white border-gray-300 text-gray-900'
                                    }`}
                                />
                            </div>
                            <div>
                                <label className={`block text-sm font-medium mb-2 ${currentTheme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                    Email
                                </label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    disabled
                                    className={`w-full px-3 py-2 border rounded-md bg-gray-100 ${
                                        currentTheme === 'dark' 
                                            ? 'border-gray-600 text-gray-400' 
                                            : 'border-gray-300 text-gray-500'
                                    }`}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Configuración Regional */}
                    <div>
                        <h3 className={`text-lg font-medium mb-4 ${currentTheme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                            Configuración Regional
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className={`block text-sm font-medium mb-2 ${currentTheme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                    Idioma
                                </label>
                                <LanguageSelector
                                    value={formData.language}
                                    onChange={(value) => handleInputChange('language', value)}
                                    currentTheme={currentTheme}
                                />
                            </div>
                            <div>
                                <label className={`block text-sm font-medium mb-2 ${currentTheme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                    Formato de Fecha
                                </label>
                                <select
                                    value={formData.dateFormat}
                                    onChange={(e) => handleInputChange('dateFormat', e.target.value)}
                                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 ${
                                        currentTheme === 'dark' 
                                            ? 'bg-gray-700 border-gray-600 text-white' 
                                            : 'bg-white border-gray-300 text-gray-900'
                                    }`}
                                >
                                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Preferencias */}
                    <div>
                        <h3 className={`text-lg font-medium mb-4 ${currentTheme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                            Preferencias
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className={`block text-sm font-medium mb-2 ${currentTheme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                    Tema
                                </label>
                                <select
                                    value={formData.theme}
                                    onChange={(e) => handleInputChange('theme', e.target.value)}
                                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 ${
                                        currentTheme === 'dark' 
                                            ? 'bg-gray-700 border-gray-600 text-white' 
                                            : 'bg-white border-gray-300 text-gray-900'
                                    }`}
                                >
                                    <option value="dark">Oscuro</option>
                                    <option value="light">Claro</option>
                                    <option value="auto">Automático</option>
                                </select>
                            </div>
                            <div>
                                <label className="flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={formData.notifications}
                                        onChange={(e) => handleInputChange('notifications', e.target.checked)}
                                        className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                                    />
                                    <span className={`ml-2 text-sm ${currentTheme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                        Recibir notificaciones
                                    </span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className={`flex justify-end gap-3 p-6 border-t ${currentTheme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
                    <button
                        onClick={onClose}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                            currentTheme === 'dark'
                                ? 'text-gray-300 hover:text-white'
                                : 'text-gray-700 hover:text-gray-900'
                        }`}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors"
                    >
                        Guardar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default UserProfileModal; 