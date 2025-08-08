import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function SecuritySettings({ 
    isOpen, 
    onClose, 
    securityHook,
    onLockApp,
    currentTheme = 'light'
}) {
    const { t } = useTranslation();
    const [currentPin, setCurrentPin] = useState('');
    const [newPin, setNewPin] = useState('');
    const [confirmNewPin, setConfirmNewPin] = useState('');
    const [showPins, setShowPins] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [activeTab, setActiveTab] = useState('lock'); // Cambio: 'lock' como tab por defecto

    const {
        isPinSet,
        setupPin,
        changePin,
        disablePin,
        lockApp,
        getTimeUntilLock,
        pinLength,
        config,
        updateConfig
    } = securityHook;

    // Opciones de tiempo de auto-bloqueo
    const lockDelayOptions = [
        { value: 5 * 60 * 1000, label: '5 minutos' },
        { value: 10 * 60 * 1000, label: '10 minutos' },
        { value: 15 * 60 * 1000, label: '15 minutos' },
        { value: 30 * 60 * 1000, label: '30 minutos' },
        { value: 0, label: t('security.notConfigured') }
    ];

    // Manejar cambio de PIN
    const handleChangePin = () => {
        setError('');
        setSuccess('');

        if (!currentPin || !newPin || !confirmNewPin) {
            setError(t('security.allFieldsRequired'));
            return;
        }

        if (newPin !== confirmNewPin) {
            setError(t('security.pinsDoNotMatch'));
            return;
        }

        if (newPin.length !== pinLength) {
            setError(t('security.pinMustBeDigits', { digits: pinLength }));
            return;
        }

        const success = changePin(currentPin, newPin);
        
        if (success) {
            setSuccess(t('security.pinChangedSuccessfully'));
            setCurrentPin('');
            setNewPin('');
            setConfirmNewPin('');
        } else {
            setError(t('security.currentPinIncorrect'));
        }
    };

    // Manejar deshabilitar PIN
    const handleDisablePin = () => {
        setError('');
        setSuccess('');

        if (!currentPin) {
            setError(t('security.enterCurrentPin'));
            return;
        }

        const success = disablePin(currentPin);
        
        if (success) {
            setSuccess(t('security.pinDisabledSuccessfully'));
            setCurrentPin('');
            onClose();
        } else {
            setError(t('security.incorrectPinError'));
        }
    };

    // Manejar bloquear app
    const handleLockApp = () => {
        lockApp();
        onClose();
    };

    // Obtener tiempo restante formateado
    const getFormattedTimeUntilLock = () => {
        const seconds = getTimeUntilLock();
        if (seconds === null) return t('security.notConfigured');
        if (seconds === 0) return t('security.locked');
        
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        
        if (minutes > 0) {
            return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
        }
        return `${remainingSeconds}s`;
    };

    if (!isOpen) return null;

    return (
        <div className={`fixed inset-0 ${currentTheme === 'dark' ? 'bg-black bg-opacity-70' : 'bg-black bg-opacity-50'} flex items-center justify-center z-50`}>
            <div className={`${currentTheme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-3xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto shadow-2xl`}>
                {/* Header */}
                <div className={`flex items-center justify-between p-6 border-b ${currentTheme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 ${currentTheme === 'dark' ? 'bg-blue-900' : 'bg-blue-100'} rounded-full flex items-center justify-center`}>
                            <span className={`${currentTheme === 'dark' ? 'text-blue-300' : 'text-blue-600'} text-xl`}>🔒</span>
                        </div>
                        <div>
                            <h2 className={`font-bold text-xl ${currentTheme === 'dark' ? 'text-white' : 'text-gray-800'}`}>{t('security.security')}</h2>
                            <p className={`text-sm ${currentTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>{t('security.protectPersonalDiary')}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className={`${currentTheme === 'dark' ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'} transition-colors duration-200`}
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Tabs simplificados */}
                <div className={`flex border-b ${currentTheme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
                    <button
                        onClick={() => setActiveTab('lock')}
                        className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
                            activeTab === 'lock' 
                                ? `${currentTheme === 'dark' ? 'text-blue-400 border-blue-400' : 'text-blue-600 border-blue-600'} border-b-2` 
                                : `${currentTheme === 'dark' ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`
                        }`}
                    >
                        🔒 {t('security.lock')}
                    </button>
                    <button
                        onClick={() => setActiveTab('settings')}
                        className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
                            activeTab === 'settings' 
                                ? `${currentTheme === 'dark' ? 'text-blue-400 border-blue-400' : 'text-blue-600 border-blue-600'} border-b-2` 
                                : `${currentTheme === 'dark' ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`
                        }`}
                    >
                        ⚙️ {t('security.settings')}
                    </button>
                    <button
                        onClick={() => setActiveTab('pin')}
                        className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
                            activeTab === 'pin' 
                                ? `${currentTheme === 'dark' ? 'text-blue-400 border-blue-400' : 'text-blue-600 border-blue-600'} border-b-2` 
                                : `${currentTheme === 'dark' ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`
                        }`}
                    >
                        🔐 {t('security.pin')}
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {activeTab === 'lock' ? (
                        <div className="space-y-8">
                            {/* Bloqueo inmediato - Acción principal */}
                            <div className="text-center">
                                <div className={`w-20 h-20 ${currentTheme === 'dark' ? 'bg-red-900' : 'bg-red-100'} rounded-full flex items-center justify-center mx-auto mb-6`}>
                                    <span className="text-3xl">🔒</span>
                                </div>
                                <h3 className={`font-bold text-xl ${currentTheme === 'dark' ? 'text-white' : 'text-gray-800'} mb-3`}>
                                    {t('security.lockDiary')}
                                </h3>
                                <p className={`text-sm ${currentTheme === 'dark' ? 'text-gray-300' : 'text-gray-600'} mb-8`}>
                                    {t('security.lockDiaryDescription')}
                                </p>
                                <button
                                    onClick={handleLockApp}
                                    className="w-full px-8 py-4 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors font-medium text-lg shadow-lg hover:shadow-xl transform hover:scale-105 duration-200"
                                >
                                    🔒 {t('security.lockNow')}
                                </button>
                            </div>

                            {/* Estado actual simplificado */}
                            <div className={`${currentTheme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'} rounded-xl p-6`}>
                                <h4 className={`font-semibold text-lg ${currentTheme === 'dark' ? 'text-white' : 'text-gray-800'} mb-4`}>{t('security.currentStatus')}</h4>
                                <div className="space-y-3 text-sm">
                                    <div className="flex justify-between items-center">
                                        <span className={`${currentTheme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>{t('security.protection')}</span>
                                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${isPinSet ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                            {isPinSet ? t('security.activated') : t('security.deactivated')}
                                        </span>
                                    </div>
                                    {isPinSet && (
                                        <div className="flex justify-between items-center">
                                            <span className={`${currentTheme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>{t('security.lockIn')}</span>
                                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${currentTheme === 'dark' ? 'bg-blue-900 text-blue-300' : 'bg-blue-100 text-blue-800'}`}>
                                                {getFormattedTimeUntilLock()}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : activeTab === 'settings' ? (
                        <div className="space-y-8">
                            {/* Configuración de auto-bloqueo */}
                            <div>
                                <h3 className={`font-semibold text-lg ${currentTheme === 'dark' ? 'text-white' : 'text-gray-800'} mb-3`}>{t('security.autoLock')}</h3>
                                <p className={`text-sm ${currentTheme === 'dark' ? 'text-gray-300' : 'text-gray-600'} mb-4`}>
                                    {t('security.autoLockDescription')}
                                </p>
                                <select 
                                    className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500 focus:ring-opacity-50 focus:border-transparent transition-all duration-200 ${currentTheme === 'dark' ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-300 bg-white text-gray-800'}`}
                                    value={config.autoLockDelay}
                                    onChange={(e) => {
                                        const newDelay = parseInt(e.target.value);
                                        updateConfig({ autoLockDelay: newDelay });
                                    }}
                                >
                                    {lockDelayOptions.map(option => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Bloqueo al cambiar de pestaña */}
                            <div>
                                <h3 className={`font-semibold text-lg ${currentTheme === 'dark' ? 'text-white' : 'text-gray-800'} mb-3`}>{t('security.lockOnTabChange')}</h3>
                                <p className={`text-sm ${currentTheme === 'dark' ? 'text-gray-300' : 'text-gray-600'} mb-4`}>
                                    {t('security.lockOnTabChangeDescription')}
                                </p>
                                <label className="flex items-center space-x-4 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={config.requirePinOnResume}
                                        onChange={(e) => {
                                            updateConfig({ requirePinOnResume: e.target.checked });
                                        }}
                                        className={`w-5 h-5 rounded focus:ring-4 focus:ring-blue-500 focus:ring-opacity-50 transition-all duration-200 ${currentTheme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'}`}
                                    />
                                    <span className={`text-sm ${currentTheme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                        {t('security.requirePinOnResume')}
                                    </span>
                                </label>
                            </div>

                            {/* Información de seguridad */}
                            <div className={`${currentTheme === 'dark' ? 'bg-blue-900 border-blue-700' : 'bg-blue-50 border-blue-200'} border-2 rounded-xl p-6`}>
                                <h4 className={`font-semibold text-lg ${currentTheme === 'dark' ? 'text-blue-300' : 'text-blue-800'} mb-4`}>{t('security.howItWorks')}</h4>
                                <ul className={`text-sm ${currentTheme === 'dark' ? 'text-blue-200' : 'text-blue-700'} space-y-2`}>
                                    {t('security.howItWorksList', { returnObjects: true }).map((item, index) => (
                                        <li key={index} className="flex items-start">
                                            <span className="mr-2">•</span>
                                            <span>{item}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-8">
                            {/* Configurar PIN por primera vez */}
                            {!isPinSet && (
                                <div className="text-center">
                                    <div className={`w-20 h-20 ${currentTheme === 'dark' ? 'bg-blue-900' : 'bg-blue-100'} rounded-full flex items-center justify-center mx-auto mb-6`}>
                                        <span className="text-3xl">🔐</span>
                                    </div>
                                    <h3 className={`font-bold text-xl ${currentTheme === 'dark' ? 'text-white' : 'text-gray-800'} mb-3`}>
                                        {t('security.setupPin')}
                                    </h3>
                                    <p className={`text-sm ${currentTheme === 'dark' ? 'text-gray-300' : 'text-gray-600'} mb-8`}>
                                        {t('security.setupPinDescription')}
                                    </p>
                                    <button
                                        onClick={() => {
                                            onClose();
                                            // Aquí se mostraría el AppLock en modo setup
                                        }}
                                        className="w-full px-8 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium text-lg shadow-lg hover:shadow-xl transform hover:scale-105 duration-200"
                                    >
                                        🔐 {t('security.setupPinButton')}
                                    </button>
                                </div>
                            )}

                            {/* Cambiar PIN */}
                            {isPinSet && (
                                <div>
                                    <h3 className={`font-semibold text-lg ${currentTheme === 'dark' ? 'text-white' : 'text-gray-800'} mb-4`}>{t('security.changePin')}</h3>
                                    <div className="space-y-4">
                                        <div>
                                            <label className={`block text-sm font-medium ${currentTheme === 'dark' ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                                                {t('security.currentPin')}
                                            </label>
                                            <div className="relative">
                                                <input
                                                    type={showPins ? "text" : "password"}
                                                    value={currentPin}
                                                    onChange={(e) => setCurrentPin(e.target.value)}
                                                    className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500 focus:ring-opacity-50 focus:border-transparent transition-all duration-200 ${currentTheme === 'dark' ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-300 bg-white text-gray-800'}`}
                                                    placeholder={t('security.pinPlaceholder')}
                                                    maxLength={pinLength}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPins(!showPins)}
                                                    className={`absolute right-4 top-1/2 transform -translate-y-1/2 ${currentTheme === 'dark' ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'} transition-colors duration-200`}
                                                >
                                                    {showPins ? "🙈" : "👁️"}
                                                </button>
                                            </div>
                                        </div>
                                        <div>
                                            <label className={`block text-sm font-medium ${currentTheme === 'dark' ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                                                {t('security.newPin')}
                                            </label>
                                            <input
                                                type={showPins ? "text" : "password"}
                                                value={newPin}
                                                onChange={(e) => setNewPin(e.target.value)}
                                                className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500 focus:ring-opacity-50 focus:border-transparent transition-all duration-200 ${currentTheme === 'dark' ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-300 bg-white text-gray-800'}`}
                                                placeholder={t('security.pinPlaceholder')}
                                                maxLength={pinLength}
                                            />
                                        </div>
                                        <div>
                                            <label className={`block text-sm font-medium ${currentTheme === 'dark' ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                                                {t('security.confirmNewPin')}
                                            </label>
                                            <input
                                                type={showPins ? "text" : "password"}
                                                value={confirmNewPin}
                                                onChange={(e) => setConfirmNewPin(e.target.value)}
                                                className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500 focus:ring-opacity-50 focus:border-transparent transition-all duration-200 ${currentTheme === 'dark' ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-300 bg-white text-gray-800'}`}
                                                placeholder={t('security.pinPlaceholder')}
                                                maxLength={pinLength}
                                            />
                                        </div>
                                        <button
                                            onClick={handleChangePin}
                                            className="w-full px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium shadow-lg hover:shadow-xl transform hover:scale-105 duration-200"
                                        >
                                            {t('security.changePinButton')}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Deshabilitar PIN */}
                            {isPinSet && (
                                <div className={`${currentTheme === 'dark' ? 'bg-red-900 border-red-700' : 'bg-red-50 border-red-200'} border-2 rounded-xl p-6`}>
                                    <h3 className={`font-semibold text-lg ${currentTheme === 'dark' ? 'text-red-300' : 'text-red-800'} mb-3`}>{t('security.disablePin')}</h3>
                                    <p className={`text-sm ${currentTheme === 'dark' ? 'text-red-200' : 'text-red-700'} mb-4`}>
                                        {t('security.disablePinDescription')}
                                    </p>
                                    <div className="space-y-4">
                                        <div>
                                            <label className={`block text-sm font-medium ${currentTheme === 'dark' ? 'text-red-300' : 'text-red-700'} mb-2`}>
                                                {t('security.currentPin')}
                                            </label>
                                            <input
                                                type={showPins ? "text" : "password"}
                                                value={currentPin}
                                                onChange={(e) => setCurrentPin(e.target.value)}
                                                className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-4 focus:ring-red-500 focus:ring-opacity-50 focus:border-transparent transition-all duration-200 ${currentTheme === 'dark' ? 'border-red-600 bg-red-800 text-white' : 'border-red-300 bg-white text-gray-800'}`}
                                                placeholder={t('security.pinPlaceholder')}
                                                maxLength={pinLength}
                                            />
                                        </div>
                                        <button
                                            onClick={handleDisablePin}
                                            className="w-full px-6 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors font-medium shadow-lg hover:shadow-xl transform hover:scale-105 duration-200"
                                        >
                                            {t('security.disablePinButton')}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Mensajes de error/éxito */}
                    {error && (
                        <div className={`${currentTheme === 'dark' ? 'bg-red-900 border-red-700' : 'bg-red-50 border-red-200'} border-2 rounded-xl p-4 mt-6 animate-shake`}>
                            <p className={`${currentTheme === 'dark' ? 'text-red-300' : 'text-red-600'} text-sm font-medium`}>{error}</p>
                        </div>
                    )}
                    {success && (
                        <div className={`${currentTheme === 'dark' ? 'bg-green-900 border-green-700' : 'bg-green-50 border-green-200'} border-2 rounded-xl p-4 mt-6 animate-fadeIn`}>
                            <p className={`${currentTheme === 'dark' ? 'text-green-300' : 'text-green-600'} text-sm font-medium`}>{success}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
} 