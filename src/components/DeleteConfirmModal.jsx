import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

const DeleteConfirmModal = ({ isOpen, onClose, onConfirm, entry, currentTheme }) => {
    const { t } = useTranslation();
    
    if (!isOpen || !entry) return null;

    const handleConfirm = () => {
        console.log('DeleteConfirmModal handleConfirm called');
        onConfirm();
        onClose();
    };

    const handleCancel = () => {
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className={`${currentTheme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-lg max-w-md w-full p-6 border ${currentTheme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className="flex items-center gap-3 mb-4">
                    <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                        <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                    </div>
                    <div>
                        <h3 className={`text-lg font-semibold ${currentTheme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                            {t('archive.deleteEntryTitle')}
                        </h3>
                        <p className={`text-sm ${currentTheme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                            {t('common.cannotBeUndone')}
                        </p>
                    </div>
                </div>
                
                <div className="mb-6">
                    <p className={`mb-3 ${currentTheme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                        {t('archive.confirmDeleteMessage', { date: entry.id })}
                    </p>
                    
                    {entry.title && entry.title !== t('diary.noTitle') && (
                        <div className={`${currentTheme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'} rounded-lg p-3 mb-3`}>
                            <p className={`text-sm font-medium ${currentTheme === 'dark' ? 'text-gray-200' : 'text-gray-800'}`}>
                                "{entry.title}"
                            </p>
                        </div>
                    )}
                    
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                        <p className="text-sm text-yellow-800">
                            <strong>⚠️ {t('common.warning')}:</strong> {t('archive.deleteWarningMessage')}
                        </p>
                    </div>
                </div>
                
                <div className="flex justify-end space-x-3">
                    <button
                        onClick={handleCancel}
                        className={`px-4 py-2 rounded-lg transition-colors ${
                            currentTheme === 'dark'
                                ? 'text-gray-300 bg-gray-700 hover:bg-gray-600'
                                : 'text-gray-700 bg-gray-200 hover:bg-gray-300'
                        }`}
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                        {t('common.delete')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DeleteConfirmModal; 