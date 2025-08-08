import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

export default function AppLock({ 
    isLocked, 
    isPinSet, 
    onUnlock, 
    onSetupPin, 
    onResetPin,
    pinLength = 4,
    currentTheme = 'light',
    children 
}) {
    const { t } = useTranslation();
    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [isSetupMode, setIsSetupMode] = useState(!isPinSet);
    const [error, setError] = useState('');
    const [showPin, setShowPin] = useState(false);
    const [timeUntilLock, setTimeUntilLock] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    
    const pinInputRef = useRef(null);
    const confirmPinRef = useRef('');

    // Auto-focus en el input de PIN
    useEffect(() => {
        if (isLocked && pinInputRef.current) {
            setTimeout(() => {
                pinInputRef.current?.focus();
            }, 100);
        }
    }, [isLocked]);

    // Manejar entrada de PIN
    const handlePinChange = (value) => {
        setError('');
        
        if (isSetupMode) {
            if (value.length <= pinLength) {
                setPin(value);
                
                // Si completó el PIN, pasar a confirmación
                if (value.length === pinLength) {
                    setTimeout(() => {
                        document.getElementById('confirm-pin')?.focus();
                    }, 300);
                }
            }
        } else {
            if (value.length <= pinLength) {
                setPin(value);
                
                // Si completó el PIN, intentar desbloquear
                if (value.length === pinLength) {
                    handleUnlock(value);
                }
            }
        }
    };

    // Manejar confirmación de PIN
    const handleConfirmPinChange = (value) => {
        setError('');
        
        if (value.length <= pinLength) {
            setConfirmPin(value);
            confirmPinRef.current = value; // Actualizar la referencia
            
            // Si completó la confirmación, verificar
            if (value.length === pinLength) {
                // Pequeño delay para asegurar que el estado se actualice
                setTimeout(() => {
                    handleSetupPin();
                }, 100);
            }
        }
    };

    // Intentar desbloquear
    const handleUnlock = async (pinToTry) => {
        setIsLoading(true);
        setError('');
        
        try {
            const success = await onUnlock(pinToTry);
            
            if (success) {
                setPin('');
                setError('');
            } else {
                setError(t('security.incorrectPin'));
                setPin('');
                setTimeout(() => {
                    pinInputRef.current?.focus();
                }, 100);
            }
        } catch (error) {
            setError(t('security.unlockError'));
            setPin('');
        } finally {
            setIsLoading(false);
        }
    };

    // Configurar PIN
    const handleSetupPin = async () => {
        const currentConfirmPin = confirmPinRef.current;
        
        if (pin !== currentConfirmPin) {
            setError(t('security.pinsDoNotMatch'));
            setConfirmPin('');
            confirmPinRef.current = '';
            setTimeout(() => {
                document.getElementById('confirm-pin')?.focus();
            }, 100);
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            const success = await onSetupPin(pin);
            
            if (success) {
                setIsSetupMode(false);
                setPin('');
                setConfirmPin('');
                confirmPinRef.current = '';
                setError('');
            } else {
                setError(t('security.setupPinError'));
            }
        } catch (error) {
            setError(t('security.setupPinError'));
        } finally {
            setIsLoading(false);
        }
    };

    // Resetear PIN (cuando el usuario lo olvida)
    const handleResetPin = async () => {
        if (onResetPin) {
            setIsLoading(true);
            setError('');
            
            try {
                await onResetPin();
                setIsSetupMode(true);
                setPin('');
                setConfirmPin('');
                confirmPinRef.current = '';
                setError('');
            } catch (error) {
                setError(t('security.resetPinError'));
            } finally {
                setIsLoading(false);
            }
        }
    };

    // Renderizar puntos del PIN
    const renderPinDots = (value, isConfirm = false) => {
        const dots = [];
        for (let i = 0; i < pinLength; i++) {
            const isFilled = i < value.length;
            const isActive = i === value.length;
            
            dots.push(
                <div
                    key={i}
                    className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                        isFilled 
                            ? `${currentTheme === 'dark' ? 'bg-blue-500 border-blue-500' : 'bg-blue-600 border-blue-600'}`
                            : isActive
                            ? `${currentTheme === 'dark' ? 'border-blue-400' : 'border-blue-500'}`
                            : `${currentTheme === 'dark' ? 'border-gray-500' : 'border-gray-300'}`
                    }`}
                />
            );
        }
        return dots;
    };

    // Si no está bloqueado y no está en modo setup, mostrar contenido normal
    if (!isLocked && !isSetupMode) {
        return children;
    }

    return (
        <div className={`fixed inset-0 ${currentTheme === 'dark' ? 'bg-black bg-opacity-80' : 'bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900'} flex items-center justify-center z-50 backdrop-blur-sm`}>
            <div className={`${currentTheme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-3xl shadow-2xl w-full max-w-md mx-4 p-8 transform transition-all duration-300 scale-100`}>
                {/* Header */}
                <div className="text-center mb-8">
                    <div className={`w-24 h-24 ${currentTheme === 'dark' ? 'bg-gradient-to-r from-blue-500 to-purple-600' : 'bg-gradient-to-r from-blue-600 to-purple-700'} rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg`}>
                        <span className="text-4xl">🔒</span>
                    </div>
                    
                    {isSetupMode ? (
                        <>
                            <h2 className={`text-3xl font-bold ${currentTheme === 'dark' ? 'text-white' : 'text-gray-800'} mb-3`}>
                                🔐 {t('security.setupSecurity')} 🔐
                            </h2>
                            <p className={`${currentTheme === 'dark' ? 'text-gray-300' : 'text-gray-600'} text-lg`}>
                                {t('security.createPinToProtect')}
                            </p>
                        </>
                    ) : (
                        <>
                            <h2 className={`text-3xl font-bold ${currentTheme === 'dark' ? 'text-white' : 'text-gray-800'} mb-3`}>
                                🔒 {t('security.diaryLocked')} 🔒
                            </h2>
                            <p className={`${currentTheme === 'dark' ? 'text-gray-300' : 'text-gray-600'} text-lg`}>
                                {t('security.enterPinToContinue')}
                            </p>
                        </>
                    )}
                </div>

                {/* PIN Input */}
                <div className="space-y-8">
                    {isSetupMode ? (
                        <>
                            {/* PIN inicial */}
                            <div>
                                <label className={`block text-sm font-medium ${currentTheme === 'dark' ? 'text-gray-200' : 'text-gray-700'} mb-4 text-center`}>
                                    {t('security.createPinDigits', { digits: pinLength })}
                                </label>
                                
                                {/* Dots del PIN */}
                                <div className="flex justify-center space-x-3 mb-6">
                                    {renderPinDots(pin)}
                                </div>
                                
                                <div className="relative">
                                    <input
                                        ref={pinInputRef}
                                        type={showPin ? "text" : "password"}
                                        value={pin}
                                        onChange={(e) => handlePinChange(e.target.value)}
                                        className={`w-full px-6 py-4 text-center text-2xl font-mono border-2 ${currentTheme === 'dark' ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-300 bg-white text-gray-800'} rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500 focus:ring-opacity-50 focus:border-transparent transition-all duration-200`}
                                        placeholder={t('security.pinPlaceholder')}
                                        maxLength={pinLength}
                                        autoComplete="off"
                                        disabled={isLoading}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPin(!showPin)}
                                        className={`absolute right-4 top-1/2 transform -translate-y-1/2 ${currentTheme === 'dark' ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'} transition-colors duration-200`}
                                        disabled={isLoading}
                                    >
                                        {showPin ? "🙈" : "👁️"}
                                    </button>
                                </div>
                            </div>

                            {/* Confirmación de PIN */}
                            {pin.length === pinLength && (
                                <div className="animate-fadeIn">
                                    <label className={`block text-sm font-medium ${currentTheme === 'dark' ? 'text-gray-200' : 'text-gray-700'} mb-4 text-center`}>
                                        {t('security.confirmPin')}
                                    </label>
                                    
                                    {/* Dots de confirmación */}
                                    <div className="flex justify-center space-x-3 mb-6">
                                        {renderPinDots(confirmPin, true)}
                                    </div>
                                    
                                    <div className="relative">
                                        <input
                                            id="confirm-pin"
                                            type={showPin ? "text" : "password"}
                                            value={confirmPin}
                                            onChange={(e) => handleConfirmPinChange(e.target.value)}
                                            className={`w-full px-6 py-4 text-center text-2xl font-mono border-2 ${currentTheme === 'dark' ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-300 bg-white text-gray-800'} rounded-xl focus:outline-none focus:ring-4 focus:ring-green-500 focus:ring-opacity-50 focus:border-transparent transition-all duration-200`}
                                            placeholder={t('security.pinPlaceholder')}
                                            maxLength={pinLength}
                                            autoComplete="off"
                                            disabled={isLoading}
                                        />
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div>
                            <label className={`block text-sm font-medium ${currentTheme === 'dark' ? 'text-gray-200' : 'text-gray-700'} mb-4 text-center`}>
                                {t('security.pinDigits', { digits: pinLength })}
                            </label>
                            
                            {/* Dots del PIN */}
                            <div className="flex justify-center space-x-3 mb-6">
                                {renderPinDots(pin)}
                            </div>
                            
                            <div className="relative">
                                <input
                                    ref={pinInputRef}
                                    type={showPin ? "text" : "password"}
                                    value={pin}
                                    onChange={(e) => handlePinChange(e.target.value)}
                                    className={`w-full px-6 py-4 text-center text-2xl font-mono border-2 ${currentTheme === 'dark' ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-300 bg-white text-gray-800'} rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500 focus:ring-opacity-50 focus:border-transparent transition-all duration-200`}
                                    placeholder={t('security.pinPlaceholder')}
                                    maxLength={pinLength}
                                    autoComplete="off"
                                    disabled={isLoading}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPin(!showPin)}
                                    className={`absolute right-4 top-1/2 transform -translate-y-1/2 ${currentTheme === 'dark' ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'} transition-colors duration-200`}
                                    disabled={isLoading}
                                >
                                    {showPin ? "🙈" : "👁️"}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Loading State */}
                    {isLoading && (
                        <div className="flex justify-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                        </div>
                    )}

                    {/* Error Message */}
                    {error && (
                        <div className={`${currentTheme === 'dark' ? 'bg-red-900 border-red-700' : 'bg-red-50 border-red-200'} border rounded-xl p-4 animate-shake`}>
                            <p className={`${currentTheme === 'dark' ? 'text-red-300' : 'text-red-600'} text-sm text-center font-medium`}>{error}</p>
                        </div>
                    )}

                    {/* Información adicional */}
                    {isSetupMode && (
                        <div className={`${currentTheme === 'dark' ? 'bg-blue-900 border-blue-700' : 'bg-blue-50 border-blue-200'} border rounded-xl p-6`}>
                            <h4 className={`font-semibold ${currentTheme === 'dark' ? 'text-blue-300' : 'text-blue-800'} mb-3 text-center`}>{t('security.whyPin')}</h4>
                            <ul className={`text-sm ${currentTheme === 'dark' ? 'text-blue-200' : 'text-blue-700'} space-y-2`}>
                                <li className="flex items-center">
                                    <span className="mr-2">🔐</span>
                                    {t('security.protectIfDeviceOpen')}
                                </li>
                                <li className="flex items-center">
                                    <span className="mr-2">⏰</span>
                                    {t('security.autoLockAfterMinutes', { minutes: 10 })}
                                </li>
                                <li className="flex items-center">
                                    <span className="mr-2">👤</span>
                                    {t('security.onlyYouCanAccess')}
                                </li>
                            </ul>
                        </div>
                    )}

                    {/* Botones adicionales */}
                    {!isSetupMode && (
                        <div className="text-center">
                            <button
                                onClick={handleResetPin}
                                disabled={isLoading}
                                className={`${currentTheme === 'dark' ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-800'} text-sm font-medium transition-colors duration-200 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                {t('security.forgotPin')}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
} 