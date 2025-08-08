import React, { useState, useEffect } from 'react';
import PremiumFeatureModal from './PremiumFeatureModal';

export default function TwoFactorAuth({ isOpen, onClose, user, onUpgradeClick, hasFeature }) {
    const [isEnabled, setIsEnabled] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [qrCode, setQrCode] = useState('');
    const [secretKey, setSecretKey] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [step, setStep] = useState('setup'); // setup, verify, enabled
    const [backupCodes, setBackupCodes] = useState([]);
    


    useEffect(() => {
        if (isOpen) {
            check2FAStatus();
        }
    }, [isOpen]);

    const check2FAStatus = async () => {
        // Simulación de verificación de estado 2FA
        setIsLoading(true);
        try {
            await new Promise(resolve => setTimeout(resolve, 1000));
            // En una implementación real, esto verificaría el estado en Firebase
            setIsEnabled(false);
            setStep('setup');
        } catch (error) {
            console.error('Error al verificar estado 2FA:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const enable2FA = async () => {
        setIsLoading(true);
        try {
            // Simulación de generación de QR y clave secreta
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            const mockSecretKey = 'JBSWY3DPEHPK3PXP';
            const mockQrCode = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
            
            setSecretKey(mockSecretKey);
            setQrCode(mockQrCode);
            setStep('verify');
        } catch (error) {
            console.error('Error al habilitar 2FA:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const verifyAndEnable = async () => {
        if (!verificationCode.trim()) return;
        
        setIsLoading(true);
        try {
            // Simulación de verificación
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Generar códigos de respaldo
            const codes = Array.from({length: 10}, () => 
                Math.random().toString(36).substring(2, 8).toUpperCase()
            );
            
            setBackupCodes(codes);
            setIsEnabled(true);
            setStep('enabled');
            
            // En una implementación real, aquí se guardaría en Firebase
        } catch (error) {
            console.error('Error al verificar código:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const disable2FA = async () => {
        setIsLoading(true);
        try {
            await new Promise(resolve => setTimeout(resolve, 1000));
            setIsEnabled(false);
            setStep('setup');
            setVerificationCode('');
            setBackupCodes([]);
        } catch (error) {
            console.error('Error al deshabilitar 2FA:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const generateNewBackupCodes = async () => {
        setIsLoading(true);
        try {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const codes = Array.from({length: 10}, () => 
                Math.random().toString(36).substring(2, 8).toUpperCase()
            );
            setBackupCodes(codes);
        } catch (error) {
            console.error('Error al generar nuevos códigos:', error);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    if (!hasFeature('two_factor')) {
        return (
            <PremiumFeatureModal
                isOpen={isOpen}
                onClose={onClose}
                onUpgrade={onUpgradeClick}
                featureName="Autenticación de Dos Factores"
                featureDescription="Protege tu cuenta con una capa adicional de seguridad usando códigos de verificación y respaldo."
                featureIcon="🔒"
            />
        );
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg w-full max-w-md mx-4">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                            <span className="text-red-600 font-semibold">🔒</span>
                        </div>
                        <div>
                            <h2 className="font-semibold">Autenticación de Dos Factores</h2>
                            <p className="text-sm text-gray-500">Seguridad adicional para tu cuenta</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="p-4">
                    {isLoading ? (
                        <div className="text-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mx-auto mb-4"></div>
                            <p className="text-gray-500">Procesando...</p>
                        </div>
                    ) : step === 'setup' ? (
                        <div className="space-y-4">
                            <div className="text-center">
                                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <span className="text-2xl">🔒</span>
                                </div>
                                <h3 className="text-lg font-medium mb-2">Habilitar 2FA</h3>
                                <p className="text-gray-600 text-sm mb-4">
                                    Añade una capa extra de seguridad a tu cuenta con autenticación de dos factores.
                                </p>
                            </div>
                            
                            <div className="bg-blue-50 rounded-lg p-4">
                                <h4 className="font-medium text-blue-800 mb-2">¿Cómo funciona?</h4>
                                <ul className="text-sm text-blue-700 space-y-1">
                                    <li>• Escanea un código QR con tu app de autenticación</li>
                                    <li>• Introduce el código de 6 dígitos para verificar</li>
                                    <li>• Recibe códigos de respaldo para emergencias</li>
                                </ul>
                            </div>
                            
                            <button
                                onClick={enable2FA}
                                className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                            >
                                Habilitar 2FA
                            </button>
                        </div>
                    ) : step === 'verify' ? (
                        <div className="space-y-4">
                            <div className="text-center">
                                <h3 className="text-lg font-medium mb-2">Configurar 2FA</h3>
                                <p className="text-gray-600 text-sm mb-4">
                                    Escanea el código QR con tu app de autenticación
                                </p>
                            </div>
                            
                            <div className="text-center">
                                <div className="bg-gray-100 rounded-lg p-4 inline-block mb-4">
                                    <img src={qrCode} alt="QR Code" className="w-32 h-32" />
                                </div>
                                <p className="text-sm text-gray-600 mb-2">Clave secreta:</p>
                                <p className="font-mono text-sm bg-gray-100 p-2 rounded">{secretKey}</p>
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Código de verificación
                                </label>
                                <input
                                    type="text"
                                    value={verificationCode}
                                    onChange={(e) => setVerificationCode(e.target.value)}
                                    placeholder="000000"
                                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                    maxLength="6"
                                />
                            </div>
                            
                            <button
                                onClick={verifyAndEnable}
                                disabled={!verificationCode.trim() || verificationCode.length !== 6}
                                className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Verificar y Habilitar
                            </button>
                        </div>
                    ) : step === 'enabled' ? (
                        <div className="space-y-4">
                            <div className="text-center">
                                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <span className="text-2xl">✅</span>
                                </div>
                                <h3 className="text-lg font-medium mb-2 text-green-800">¡2FA Habilitado!</h3>
                                <p className="text-gray-600 text-sm mb-4">
                                    Tu cuenta ahora está protegida con autenticación de dos factores.
                                </p>
                            </div>
                            
                            <div className="bg-yellow-50 rounded-lg p-4">
                                <h4 className="font-medium text-yellow-800 mb-2">Códigos de Respaldo</h4>
                                <p className="text-sm text-yellow-700 mb-3">
                                    Guarda estos códigos en un lugar seguro. Los necesitarás si pierdes tu dispositivo.
                                </p>
                                <div className="grid grid-cols-2 gap-2">
                                    {backupCodes.map((code, index) => (
                                        <div key={index} className="font-mono text-sm bg-white p-2 rounded text-center">
                                            {code}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            
                            <div className="flex gap-2">
                                <button
                                    onClick={generateNewBackupCodes}
                                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                                >
                                    Nuevos Códigos
                                </button>
                                <button
                                    onClick={disable2FA}
                                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                                >
                                    Deshabilitar 2FA
                                </button>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
} 