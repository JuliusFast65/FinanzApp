import React, { useState } from 'react';
import { TRANSACTION_CATEGORIES } from '../utils/transactionCategories';
import { saveUserCategoryPattern } from '../utils/userCategoryPatterns';

const CategoryCorrectionModal = ({ 
    isOpen, 
    onClose, 
    transaction, 
    db, 
    user, 
    appId, 
    onCorrectionSaved 
}) => {
    const [selectedCategory, setSelectedCategory] = useState(transaction?.category || '');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen || !transaction) return null;

    const handleSave = async () => {
        if (!selectedCategory) {
            setError('Por favor selecciona una categoría');
            return;
        }

        if (selectedCategory === transaction.category) {
            setError('La categoría seleccionada es la misma que la actual');
            return;
        }

        try {
            setIsLoading(true);
            setError('');

            // Guardar el patrón personalizado
            await saveUserCategoryPattern(
                db, 
                user.uid, 
                appId, 
                transaction.description, 
                selectedCategory, 
                'user'
            );

            // Llamar callback para actualizar la UI
            if (onCorrectionSaved) {
                onCorrectionSaved(transaction, selectedCategory);
            }

            onClose();
        } catch (error) {
            console.error('Error guardando corrección:', error);
            setError('Error al guardar la corrección. Inténtalo de nuevo.');
        } finally {
            setIsLoading(false);
        }
    };

    const categoryOptions = Object.entries(TRANSACTION_CATEGORIES).map(([key, data]) => ({
        key,
        ...data
    }));

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="p-6 border-b border-gray-200 dark:border-gray-600">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            Corregir Categoría
                        </h3>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    {/* Información de la transacción */}
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                            Transacción a corregir:
                        </h4>
                        <div className="space-y-2 text-sm">
                            <div>
                                <span className="text-gray-600 dark:text-gray-300">Descripción: </span>
                                <span className="font-medium text-gray-900 dark:text-white">
                                    {transaction.description}
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-600 dark:text-gray-300">Monto: </span>
                                <span className="font-medium text-gray-900 dark:text-white">
                                    ${transaction.amount?.toLocaleString()}
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-600 dark:text-gray-300">Categoría actual: </span>
                                <span 
                                    className="inline-flex items-center px-2 py-1 rounded text-xs text-white"
                                    style={{ backgroundColor: transaction.categoryData?.color || '#9CA3AF' }}
                                >
                                    {transaction.categoryData?.icon} {transaction.categoryData?.name}
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-600 dark:text-gray-300">Método: </span>
                                <span className="text-gray-900 dark:text-white">
                                    {transaction.categoryMethod === 'user_pattern' ? 'Patrón personal' :
                                     transaction.categoryMethod === 'pattern' ? 'Patrón general' :
                                     transaction.categoryMethod === 'ai' ? 'Inteligencia Artificial' : 'Desconocido'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Selector de nueva categoría */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Nueva categoría:
                        </label>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {categoryOptions.map((category) => (
                                <label
                                    key={category.key}
                                    className={`flex items-center p-3 rounded-lg cursor-pointer transition-colors ${
                                        selectedCategory === category.key
                                            ? 'bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-500'
                                            : 'bg-gray-50 dark:bg-gray-700 border-2 border-transparent hover:bg-gray-100 dark:hover:bg-gray-600'
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="category"
                                        value={category.key}
                                        checked={selectedCategory === category.key}
                                        onChange={(e) => setSelectedCategory(e.target.value)}
                                        className="sr-only"
                                    />
                                    <div className="flex items-center space-x-3 flex-1">
                                        <span className="text-xl">{category.icon}</span>
                                        <div className="flex-1">
                                            <div className="font-medium text-gray-900 dark:text-white">
                                                {category.name}
                                            </div>
                                        </div>
                                        <div 
                                            className="w-4 h-4 rounded-full"
                                            style={{ backgroundColor: category.color }}
                                        ></div>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Error message */}
                    {error && (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-md text-sm">
                            {error}
                        </div>
                    )}

                    {/* Info about learning */}
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                        <div className="flex items-start space-x-2">
                            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div className="text-sm text-blue-700 dark:text-blue-300">
                                <p className="font-medium mb-1">💡 Sistema de aprendizaje</p>
                                <p>Esta corrección se guardará como un patrón personalizado. La próxima vez que aparezca una transacción similar a "{transaction.description}", se categorizará automáticamente como {selectedCategory ? TRANSACTION_CATEGORIES[selectedCategory]?.name : 'la categoría seleccionada'}.</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-200 dark:border-gray-600 flex justify-end space-x-3">
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isLoading || !selectedCategory}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                        {isLoading && (
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        )}
                        <span>Guardar y Aprender</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CategoryCorrectionModal;
