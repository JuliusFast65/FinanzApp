import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, getDocs } from 'firebase/firestore';
import { encryptText, decryptText } from '../utils/crypto';

const CreditCardManager = ({ db, user, appId }) => {
    const { t } = useTranslation();
    const [cards, setCards] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingCard, setEditingCard] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        bank: '',
        cardNumber: '',
        limit: '',
        currentBalance: '',
        dueDate: '',
        closingDate: ''
    });

    // Cargar tarjetas del usuario
    useEffect(() => {
        if (db && user) {
            loadCards();
        }
    }, [db, user]);

    const loadCards = async () => {
        try {
            setIsLoading(true);
            const cardsRef = collection(db, `artifacts/${appId}/users/${user.uid}/creditCards`);
            const querySnapshot = await getDocs(cardsRef);
            
            const cardsData = [];
            for (const doc of querySnapshot.docs) {
                const cardData = doc.data();
                cardsData.push({
                    id: doc.id,
                    name: await decryptText(cardData.name, user.uid),
                    bank: await decryptText(cardData.bank, user.uid),
                    cardNumber: await decryptText(cardData.cardNumber, user.uid),
                    limit: parseFloat(cardData.limit),
                    currentBalance: parseFloat(cardData.currentBalance),
                    dueDate: cardData.dueDate,
                    closingDate: cardData.closingDate,
                    createdAt: cardData.createdAt
                });
            }
            
            setCards(cardsData);
        } catch (error) {
            console.error('Error loading cards:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        try {
            const cardData = {
                name: await encryptText(formData.name, user.uid),
                bank: await encryptText(formData.bank, user.uid),
                cardNumber: await encryptText(formData.cardNumber, user.uid),
                limit: parseFloat(formData.limit),
                currentBalance: parseFloat(formData.currentBalance),
                dueDate: formData.dueDate,
                closingDate: formData.closingDate,
                createdAt: new Date()
            };

            if (editingCard) {
                // Actualizar tarjeta existente
                const cardRef = doc(db, `artifacts/${appId}/users/${user.uid}/creditCards/${editingCard.id}`);
                await updateDoc(cardRef, cardData);
            } else {
                // Agregar nueva tarjeta
                const cardsRef = collection(db, `artifacts/${appId}/users/${user.uid}/creditCards`);
                await addDoc(cardsRef, cardData);
            }

            setShowAddModal(false);
            setEditingCard(null);
            resetForm();
            loadCards();
        } catch (error) {
            console.error('Error saving card:', error);
        }
    };

    const handleEdit = async (card) => {
        setEditingCard(card);
        setFormData({
            name: card.name,
            bank: card.bank,
            cardNumber: card.cardNumber,
            limit: card.limit.toString(),
            currentBalance: card.currentBalance.toString(),
            dueDate: card.dueDate,
            closingDate: card.closingDate
        });
        setShowAddModal(true);
    };

    const handleDelete = async (cardId) => {
        if (window.confirm(t('creditCards.confirmDelete'))) {
            try {
                const cardRef = doc(db, `artifacts/${appId}/users/${user.uid}/creditCards/${cardId}`);
                await deleteDoc(cardRef);
                loadCards();
            } catch (error) {
                console.error('Error deleting card:', error);
            }
        }
    };

    const resetForm = () => {
        setFormData({
            name: '',
            bank: '',
            cardNumber: '',
            limit: '',
            currentBalance: '',
            dueDate: '',
            closingDate: ''
        });
    };

    const calculateAvailableCredit = (limit, balance) => {
        return limit - balance;
    };

    const calculateUtilization = (balance, limit) => {
        return (balance / limit) * 100;
    };

    const getUtilizationColor = (utilization) => {
        if (utilization < 30) return 'text-green-600';
        if (utilization < 70) return 'text-yellow-600';
        return 'text-red-600';
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {t('creditCards.title')}
                </h2>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
                >
                    {t('creditCards.addCard')}
                </button>
            </div>

            {cards.length === 0 ? (
                <div className="text-center py-8">
                    <div className="text-gray-400 text-6xl mb-4">💳</div>
                    <p className="text-gray-600 dark:text-gray-300 text-lg">
                        {t('creditCards.noCards')}
                    </p>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="mt-4 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
                    >
                        {t('creditCards.addFirstCard')}
                    </button>
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {cards.map((card) => {
                        const availableCredit = calculateAvailableCredit(card.limit, card.currentBalance);
                        const utilization = calculateUtilization(card.currentBalance, card.limit);
                        
                        return (
                            <div key={card.id} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <h3 className="font-semibold text-gray-900 dark:text-white">
                                            {card.name}
                                        </h3>
                                        <p className="text-sm text-gray-600 dark:text-gray-300">
                                            {card.bank}
                                        </p>
                                    </div>
                                    <div className="flex space-x-2">
                                        <button
                                            onClick={() => handleEdit(card)}
                                            className="text-blue-600 hover:text-blue-800 text-sm"
                                        >
                                            {t('common.edit')}
                                        </button>
                                        <button
                                            onClick={() => handleDelete(card.id)}
                                            className="text-red-600 hover:text-red-800 text-sm"
                                        >
                                            {t('common.delete')}
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-600 dark:text-gray-300">
                                            {t('creditCards.limit')}:
                                        </span>
                                        <span className="font-medium text-gray-900 dark:text-white">
                                            ${card.limit.toLocaleString()}
                                        </span>
                                    </div>
                                    
                                    <div className="flex justify-between">
                                        <span className="text-gray-600 dark:text-gray-300">
                                            {t('creditCards.balance')}:
                                        </span>
                                        <span className="font-medium text-gray-900 dark:text-white">
                                            ${card.currentBalance.toLocaleString()}
                                        </span>
                                    </div>
                                    
                                    <div className="flex justify-between">
                                        <span className="text-gray-600 dark:text-gray-300">
                                            {t('creditCards.available')}:
                                        </span>
                                        <span className={`font-medium ${availableCredit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            ${availableCredit.toLocaleString()}
                                        </span>
                                    </div>
                                    
                                    <div className="flex justify-between">
                                        <span className="text-gray-600 dark:text-gray-300">
                                            {t('creditCards.utilization')}:
                                        </span>
                                        <span className={`font-medium ${getUtilizationColor(utilization)}`}>
                                            {utilization.toFixed(1)}%
                                        </span>
                                    </div>
                                    
                                    <div className="flex justify-between">
                                        <span className="text-gray-600 dark:text-gray-300">
                                            {t('creditCards.dueDate')}:
                                        </span>
                                        <span className="font-medium text-gray-900 dark:text-white">
                                            {card.dueDate}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modal para agregar/editar tarjeta */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                            {editingCard ? t('creditCards.editCard') : t('creditCards.addCard')}
                        </h3>
                        
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    {t('creditCards.cardName')}
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white"
                                    required
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    {t('creditCards.bank')}
                                </label>
                                <input
                                    type="text"
                                    value={formData.bank}
                                    onChange={(e) => setFormData({...formData, bank: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white"
                                    required
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    {t('creditCards.cardNumber')}
                                </label>
                                <input
                                    type="text"
                                    value={formData.cardNumber}
                                    onChange={(e) => setFormData({...formData, cardNumber: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white"
                                    placeholder="**** **** **** ****"
                                    required
                                />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        {t('creditCards.limit')}
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.limit}
                                        onChange={(e) => setFormData({...formData, limit: e.target.value})}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white"
                                        required
                                    />
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        {t('creditCards.currentBalance')}
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.currentBalance}
                                        onChange={(e) => setFormData({...formData, currentBalance: e.target.value})}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white"
                                        required
                                    />
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        {t('creditCards.dueDate')}
                                    </label>
                                    <input
                                        type="date"
                                        value={formData.dueDate}
                                        onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white"
                                        required
                                    />
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        {t('creditCards.closingDate')}
                                    </label>
                                    <input
                                        type="date"
                                        value={formData.closingDate}
                                        onChange={(e) => setFormData({...formData, closingDate: e.target.value})}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white"
                                        required
                                    />
                                </div>
                            </div>
                            
                            <div className="flex space-x-3 pt-4">
                                <button
                                    type="submit"
                                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
                                >
                                    {editingCard ? t('common.update') : t('common.save')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowAddModal(false);
                                        setEditingCard(null);
                                        resetForm();
                                    }}
                                    className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
                                >
                                    {t('common.cancel')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CreditCardManager;
