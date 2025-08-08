import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { APP_VERSION } from '../config/version';

export default function HamburgerMenu({ 
    onUserProfile,
    onSecuritySettings,
    onSubscriptionModal,
    subscription,
    currentTheme = 'dark'
}) {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef(null);

    // Cerrar menú al hacer clic fuera
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleMenuToggle = () => {
        setIsOpen(!isOpen);
    };

    const handleMenuItemClick = (action) => {
        setIsOpen(false);
        action();
    };

    const getPlanColor = (plan) => {
        switch (plan) {
            case 'free': return 'text-gray-400';
            case 'premium': return 'text-yellow-400';
            default: return 'text-gray-400';
        }
    };

    const getPlanIcon = (plan) => {
        switch (plan) {
            case 'free': return '⭐';
            case 'premium': return '💎';
            default: return '⭐';
        }
    };

    return (
        <div className="relative" ref={menuRef}>
            {/* Botón hamburguesa */}
            <button
                onClick={handleMenuToggle}
                className={`${currentTheme === 'dark' ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'} transition-colors p-2 rounded-lg`}
                title={t('navigation.menu')}
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
            </button>

            {/* Menú desplegable */}
            {isOpen && (
                <div className={`absolute right-0 mt-2 w-64 rounded-lg shadow-xl border z-50 ${
                    currentTheme === 'dark' 
                        ? 'bg-gray-800 border-gray-700' 
                        : 'bg-white border-gray-200'
                }`}>
                    {/* Header del menú */}
                    <div className={`p-4 border-b ${currentTheme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
                        <div className="flex items-center justify-between">
                            <h3 className={`font-semibold ${currentTheme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{t('hamburgerMenu.options')}</h3>
                            <button
                                onClick={handleMenuToggle}
                                className={`${currentTheme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        
                        {/* Estado de suscripción */}
                        <div className="mt-2 flex items-center gap-2">
                            <span className={`text-sm ${getPlanColor(subscription.plan)}`}>
                                {getPlanIcon(subscription.plan)} {subscription.plan === 'free' ? t('hamburgerMenu.free') : t('hamburgerMenu.premium')}
                            </span>
                            <button
                                onClick={() => handleMenuItemClick(onSubscriptionModal)}
                                className="text-xs text-blue-400 hover:text-blue-300 underline"
                            >
                                {t('hamburgerMenu.changePlan')}
                            </button>
                        </div>
                    </div>

                    {/* Sección Configuración */}
                    <div className="p-2">
                        <h4 className={`text-xs font-medium uppercase tracking-wider px-3 py-2 ${currentTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                            Configuración
                        </h4>
                        
                        <button
                            onClick={() => handleMenuItemClick(onUserProfile)}
                            className={`w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg transition-colors ${
                                currentTheme === 'dark' 
                                    ? 'text-gray-300 hover:bg-gray-700' 
                                    : 'text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            <span className="text-blue-400">👤</span>
                            <div className="font-medium">{t('hamburgerMenu.myProfile')}</div>
                        </button>

                        <button
                            onClick={() => handleMenuItemClick(onSecuritySettings)}
                            className={`w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg transition-colors ${
                                currentTheme === 'dark' 
                                    ? 'text-gray-300 hover:bg-gray-700' 
                                    : 'text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            <span className="text-red-400">🔒</span>
                            <div className="font-medium">Configuración de Seguridad</div>
                        </button>
                    </div>

                    {/* Footer */}
                    <div className={`p-3 border-t ${currentTheme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
                        <div className={`text-xs ${currentTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                            {t('hamburgerMenu.version')} {APP_VERSION}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
} 