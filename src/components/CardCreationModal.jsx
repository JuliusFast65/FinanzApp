import React, { useState } from 'react';

const CardCreationModal = ({ 
    isOpen, 
    onClose, 
    suggestions, 
    analysisData, 
    onCreateNew, 
    onLinkExisting 
}) => {
    const [selectedOption, setSelectedOption] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);

    if (!isOpen || !suggestions) return null;

    const handleConfirm = async () => {
        if (!selectedOption) return;

        setIsProcessing(true);
        try {
            if (selectedOption.id === 'link') {
                await onLinkExisting(selectedOption.card);
            } else if (selectedOption.id === 'create_new' || selectedOption.id === 'create_anyway') {
                await onCreateNew();
            }
            onClose();
        } catch (error) {
            console.error('Error en confirmación:', error);
        } finally {
            setIsProcessing(false);
        }
    };

    const getSeverityStyles = (severity) => {
        switch (severity) {
            case 'success':
                return 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20';
            case 'warning':
                return 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20';
            case 'error':
                return 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20';
            default:
                return 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20';
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                            {suggestions.title}
                        </h2>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            disabled={isProcessing}
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6">
                    {/* Alert Message */}
                    <div className={`p-4 rounded-lg border mb-6 ${getSeverityStyles(suggestions.severity)}`}>
                        <p className="text-gray-700 dark:text-gray-300">
                            {suggestions.message}
                        </p>
                    </div>

                    {/* Analysis Data Preview */}
                    <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                            📄 Datos del Estado de Cuenta:
                        </h3>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            {analysisData.bankName && (
                                <div>
                                    <span className="text-gray-600 dark:text-gray-400">Banco:</span>
                                    <span className="ml-2 font-medium text-gray-900 dark:text-white">
                                        {analysisData.bankName}
                                    </span>
                                </div>
                            )}
                            {analysisData.lastFourDigits && (
                                <div>
                                    <span className="text-gray-600 dark:text-gray-400">Últimos 4:</span>
                                    <span className="ml-2 font-medium text-gray-900 dark:text-white">
                                        ****{analysisData.lastFourDigits}
                                    </span>
                                </div>
                            )}
                            {analysisData.cardHolderName && (
                                <div className="col-span-2">
                                    <span className="text-gray-600 dark:text-gray-400">Titular:</span>
                                    <span className="ml-2 font-medium text-gray-900 dark:text-white">
                                        {analysisData.cardHolderName}
                                    </span>
                                </div>
                            )}
                            {analysisData.creditLimit && (
                                <div>
                                    <span className="text-gray-600 dark:text-gray-400">Límite:</span>
                                    <span className="ml-2 font-medium text-gray-900 dark:text-white">
                                        ${analysisData.creditLimit.toLocaleString()}
                                    </span>
                                </div>
                            )}
                            {analysisData.totalBalance !== null && (
                                <div>
                                    <span className="text-gray-600 dark:text-gray-400">Saldo:</span>
                                    <span className="ml-2 font-medium text-gray-900 dark:text-white">
                                        ${analysisData.totalBalance.toLocaleString()}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Options */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                            ¿Qué deseas hacer?
                        </h3>
                        
                        {suggestions.options.map((option, index) => (
                            <div
                                key={index}
                                className={`relative border rounded-lg p-4 cursor-pointer transition-all ${
                                    selectedOption?.id === option.id && selectedOption?.card?.id === option.card?.id
                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                                }`}
                                onClick={() => setSelectedOption(option)}
                            >
                                <div className="flex items-start">
                                    <input
                                        type="radio"
                                        checked={selectedOption?.id === option.id && selectedOption?.card?.id === option.card?.id}
                                        onChange={() => setSelectedOption(option)}
                                        className="mt-1 mr-3 text-blue-600"
                                    />
                                    <div className="flex-1">
                                        <div className="flex items-center">
                                            <span className="font-medium text-gray-900 dark:text-white">
                                                {option.label}
                                            </span>
                                            {option.recommended && (
                                                <span className="ml-2 px-2 py-1 text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full">
                                                    Recomendado
                                                </span>
                                            )}
                                        </div>
                                        
                                        {/* Detalles de la tarjeta existente */}
                                        {option.card && (
                                            <div className="mt-2 p-3 bg-white dark:bg-gray-800 rounded border border-gray-100 dark:border-gray-600">
                                                <div className="text-sm text-gray-600 dark:text-gray-400">
                                                    <div><strong>Banco:</strong> {option.card.bank}</div>
                                                    <div><strong>Número:</strong> {option.card.cardNumber || 'No disponible'}</div>
                                                    {option.card.limit && (
                                                        <div><strong>Límite:</strong> ${option.card.limit.toLocaleString()}</div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Razones de coincidencia */}
                                        {option.reasons && option.reasons.length > 0 && (
                                            <div className="mt-2">
                                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                                                    Razones de similitud:
                                                </p>
                                                <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-1">
                                                    {option.reasons.slice(0, 3).map((reason, idx) => (
                                                        <li key={idx} className="flex items-start">
                                                            <span className="mr-1">•</span>
                                                            <span>{reason}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
                    <button
                        onClick={onClose}
                        disabled={isProcessing}
                        className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={!selectedOption || isProcessing}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                    >
                        {isProcessing && (
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        )}
                        Confirmar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CardCreationModal;
