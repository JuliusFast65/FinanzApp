import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, getDocs } from 'firebase/firestore';
import { encryptText, decryptText } from '../utils/crypto';
import { findExistingDuplicates, canSafelyDeleteCard } from '../utils/cardCleaner';
import CreditCardDeleteModal from './CreditCardDeleteModal';
import useTheme from '../hooks/useTheme';

const CreditCardManager = ({ db, user, appId }) => {
    const { t } = useTranslation();
    const { currentTheme } = useTheme();
    const [cards, setCards] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingCard, setEditingCard] = useState(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [cardToDelete, setCardToDelete] = useState(null);
    const [statementsToDelete, setStatementsToDelete] = useState(0);
    const [duplicateAnalysis, setDuplicateAnalysis] = useState(null);
    const [showDuplicateModal, setShowDuplicateModal] = useState(false);
    const [showSimilarCardModal, setShowSimilarCardModal] = useState(false);
    const [similarCards, setSimilarCards] = useState([]);
    const [pendingCardData, setPendingCardData] = useState(null);
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

    // Analizar duplicados cuando se cargan las tarjetas
    useEffect(() => {
        if (cards.length > 0) {
            analyzeExistingDuplicates();
        }
    }, [cards]);

    const loadCards = async () => {
        try {
            setIsLoading(true);
            const cardsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'creditCards');
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

    const analyzeExistingDuplicates = () => {
        const analysis = findExistingDuplicates(cards);
        setDuplicateAnalysis(analysis);
        
        // Mostrar alerta si hay duplicados
        if (analysis.hasDuplicates) {
            console.warn('🚨 Se detectaron tarjetas duplicadas:', analysis.duplicateGroups);
        }
    };

    const checkDuplicateCard = async (cardNumber, excludeId = null) => {
        // Verificar si ya existe una tarjeta con este número
        const lastFour = cardNumber.slice(-4);
        
        for (const card of cards) {
            if (excludeId && card.id === excludeId) {
                continue; // Excluir la tarjeta que estamos editando
            }
            
            const existingLastFour = card.cardNumber.slice(-4);
            
            if (existingLastFour === lastFour) {
                return true; // Mantener compatibilidad con el código existente
            }
        }
        
        return false;
    };

    const checkSimilarCards = async (bank, name, excludeId = null) => {
        // Verificar si ya existe una tarjeta con el mismo banco y nombre
        const similarCards = [];
        
        for (const card of cards) {
            if (excludeId && card.id === excludeId) {
                continue; // Excluir la tarjeta que estamos editando
            }
            
            if (card.bank === bank && card.name === name) {
                similarCards.push(card);
            }
        }
        
        if (similarCards.length > 0) {
            return { isSimilar: true, similarCards };
        }
        
        return { isSimilar: false, similarCards: [] };
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (isSaving) return; // Prevenir doble-click
        
        try {
            setIsSaving(true);
            
            // Validar duplicados solo para nuevas tarjetas o si se cambió el número
            if (!editingCard || (editingCard && editingCard.cardNumber !== formData.cardNumber)) {
                const isDuplicate = await checkDuplicateCard(formData.cardNumber, editingCard?.id);
                if (isDuplicate) {
                    alert('Ya existe una tarjeta con este número. Los últimos 4 dígitos deben ser únicos.');
                    setIsSaving(false);
                    return;
                }
            }

            // Verificar tarjetas similares (mismo banco y nombre)
            const similarCheck = await checkSimilarCards(formData.bank, formData.name, editingCard?.id);
            
            if (similarCheck.isSimilar) {
                // Mostrar modal para que el usuario decida
                setSimilarCards(similarCheck.similarCards);
                setPendingCardData({
                    name: formData.name,
                    bank: formData.bank,
                    cardNumber: formData.cardNumber,
                    limit: parseFloat(formData.limit),
                    currentBalance: parseFloat(formData.currentBalance),
                    dueDate: formData.dueDate,
                    closingDate: formData.closingDate,
                    isEditing: !!editingCard,
                    editingCardId: editingCard?.id
                });
                setShowSimilarCardModal(true);
                setIsSaving(false);
                return;
            }
            
            const cardData = {
                name: await encryptText(formData.name, user.uid),
                bank: await encryptText(formData.bank, user.uid),
                cardNumber: await encryptText(formData.cardNumber, user.uid),
                limit: parseFloat(formData.limit),
                currentBalance: parseFloat(formData.currentBalance),
                dueDate: formData.dueDate,
                closingDate: formData.closingDate,
                createdAt: editingCard ? editingCard.createdAt : new Date(),
                lastUpdated: new Date()
            };

            if (editingCard) {
                // Actualizar tarjeta existente
                const cardRef = doc(db, 'artifacts', appId, 'users', user.uid, 'creditCards', editingCard.id);
                await updateDoc(cardRef, cardData);
            } else {
                // Agregar nueva tarjeta
                const cardsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'creditCards');
                await addDoc(cardsRef, cardData);
            }

            setShowAddModal(false);
            setEditingCard(null);
            resetForm();
            await loadCards(); // Recargar para mostrar cambios
        } catch (error) {
            console.error('❌ Error saving card:', error);
            alert('Error al guardar la tarjeta. Inténtalo de nuevo.');
        } finally {
            setIsSaving(false);
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
        try {
            // Primero, consultar cuántos estados de cuenta están asociados a esta tarjeta
            const statementsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'statements');
            const statementsQuery = query(statementsRef, where('cardId', '==', cardId));
            const statementsSnapshot = await getDocs(statementsQuery);
            const statementsCount = statementsSnapshot.docs.length;
            
            // Encontrar la tarjeta para mostrar en el modal
            const card = cards.find(c => c.id === cardId);
            if (!card) return;
            
            // Configurar el modal de eliminación
            setCardToDelete(card);
            setStatementsToDelete(statementsCount);
            setShowDeleteModal(true);
        } catch (error) {
            console.error('Error preparing delete confirmation:', error);
            alert(t('creditCards.deleteError'));
        }
    };

    const confirmDelete = async () => {
        if (!cardToDelete) return;
        
        try {
            // Eliminar todos los estados de cuenta asociados primero
            if (statementsToDelete > 0) {
                const statementsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'statements');
                const statementsQuery = query(statementsRef, where('cardId', '==', cardToDelete.id));
                const statementsSnapshot = await getDocs(statementsQuery);
                
                const deletePromises = statementsSnapshot.docs.map(doc => 
                    deleteDoc(doc.ref)
                );
                await Promise.all(deletePromises);
            }
            
            // Luego eliminar la tarjeta
            const cardRef = doc(db, 'artifacts', appId, 'users', user.uid, 'creditCards', cardToDelete.id);
            await deleteDoc(cardRef);
            
            // Recargar la lista de tarjetas
            await loadCards();
            
            // Cerrar el modal
            setShowDeleteModal(false);
            setCardToDelete(null);
            setStatementsToDelete(0);
        } catch (error) {
            console.error('Error deleting card and statements:', error);
            alert(t('creditCards.deleteError'));
        }
    };

    const closeDeleteModal = () => {
        setShowDeleteModal(false);
        setCardToDelete(null);
        setStatementsToDelete(0);
    };

    const handleSimilarCardConfirm = async (action) => {
        if (!pendingCardData) return;
        
        try {
            setIsSaving(true);
            
            if (action === 'create') {
                // Crear la tarjeta como nueva
                const cardData = {
                    name: await encryptText(pendingCardData.name, user.uid),
                    bank: await encryptText(pendingCardData.bank, user.uid),
                    cardNumber: await encryptText(pendingCardData.cardNumber, user.uid),
                    limit: pendingCardData.limit,
                    currentBalance: pendingCardData.currentBalance,
                    dueDate: pendingCardData.dueDate,
                    closingDate: pendingCardData.closingDate,
                    createdAt: new Date(),
                    lastUpdated: new Date()
                };
                
                const cardsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'creditCards');
                await addDoc(cardsRef, cardData);
            } else if (action === 'update') {
                // Actualizar la tarjeta existente
                const cardData = {
                    name: await encryptText(pendingCardData.name, user.uid),
                    bank: await encryptText(pendingCardData.bank, user.uid),
                    cardNumber: await encryptText(pendingCardData.cardNumber, user.uid),
                    limit: pendingCardData.limit,
                    currentBalance: pendingCardData.currentBalance,
                    dueDate: pendingCardData.dueDate,
                    closingDate: pendingCardData.closingDate,
                    lastUpdated: new Date()
                };
                
                const cardRef = doc(db, 'artifacts', appId, 'users', user.uid, 'creditCards', pendingCardData.editingCardId);
                await updateDoc(cardRef, cardData);
            }
            
            // Cerrar modales y recargar
            setShowSimilarCardModal(false);
            setShowAddModal(false);
            setEditingCard(null);
            setPendingCardData(null);
            setSimilarCards([]);
            resetForm();
            await loadCards();
        } catch (error) {
            console.error('❌ Error saving card:', error);
            alert('Error al guardar la tarjeta. Inténtalo de nuevo.');
        } finally {
            setIsSaving(false);
        }
    };

    const closeSimilarCardModal = () => {
        setShowSimilarCardModal(false);
        setPendingCardData(null);
        setSimilarCards([]);
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

            {/* Alerta de tarjetas duplicadas */}
            {duplicateAnalysis && duplicateAnalysis.hasDuplicates && (
                <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <div className="flex items-start">
                        <div className="flex-shrink-0">
                            <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div className="ml-3 flex-1">
                            <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                                🚨 Tarjetas Duplicadas Detectadas
                            </h3>
                            <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
                                <p>Se encontraron {duplicateAnalysis.duplicateGroups.length} grupo(s) de tarjetas que parecen ser duplicadas.</p>
                                <button
                                    onClick={() => setShowDuplicateModal(true)}
                                    className="mt-2 inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-yellow-800 bg-yellow-100 hover:bg-yellow-200 dark:bg-yellow-800 dark:text-yellow-200 dark:hover:bg-yellow-700"
                                >
                                    Revisar Duplicados
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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
                                            {card.bank} • {card.name}
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                                            **** **** **** {card.cardNumber.slice(-4)}
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
                                    disabled={isSaving}
                                    className={`flex-1 font-semibold py-2 px-4 rounded-lg transition-colors duration-200 ${
                                        isSaving 
                                            ? 'bg-gray-400 cursor-not-allowed text-gray-200' 
                                            : 'bg-green-600 hover:bg-green-700 text-white'
                                    }`}
                                >
                                    {isSaving ? (
                                        <span className="flex items-center justify-center">
                                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            Guardando...
                                        </span>
                                    ) : (
                                        editingCard ? t('common.update') : t('common.save')
                                    )}
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
            
            {/* Modal de confirmación de eliminación */}
            <CreditCardDeleteModal
                isOpen={showDeleteModal}
                onClose={closeDeleteModal}
                onConfirm={confirmDelete}
                card={cardToDelete}
                statementsCount={statementsToDelete}
                currentTheme={currentTheme}
            />

            {/* Modal de tarjetas duplicadas */}
            {showDuplicateModal && duplicateAnalysis && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                🔄 Gestión de Tarjetas Duplicadas
                            </h3>
                            <button
                                onClick={() => setShowDuplicateModal(false)}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="space-y-4">
                            {duplicateAnalysis.duplicateGroups.map((group, index) => (
                                <div key={index} className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
                                        Grupo {index + 1}: {group.cards.length} tarjeta(s) similar(es)
                                    </h4>
                                    
                                    <div className="space-y-3">
                                        {group.cards.map((card, cardIndex) => (
                                            <div key={card.id} className={`p-3 rounded-lg border ${
                                                cardIndex === 0 
                                                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
                                                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                                            }`}>
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <p className={`font-medium ${
                                                            cardIndex === 0 
                                                                ? 'text-green-800 dark:text-green-200' 
                                                                : 'text-red-800 dark:text-red-200'
                                                        }`}>
                                                            {cardIndex === 0 ? '✅ Principal' : '❌ Duplicada'} - {card.name}
                                                        </p>
                                                        <p className="text-sm text-gray-600 dark:text-gray-400">
                                                            {card.bank} • {card.cardNumber} • Límite: ${card.limit?.toLocaleString() || 'N/A'}
                                                        </p>
                                                    </div>
                                                    {cardIndex > 0 && (
                                                        <button
                                                            onClick={() => handleDelete(card.id)}
                                                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                                                        >
                                                            Eliminar
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-6 flex justify-end">
                            <button
                                onClick={() => setShowDuplicateModal(false)}
                                className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de tarjetas similares */}
            {showSimilarCardModal && pendingCardData && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-2xl mx-4">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                🔍 Tarjetas Similares Detectadas
                            </h3>
                            <button
                                onClick={closeSimilarCardModal}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="mb-6">
                            <p className="text-gray-700 dark:text-gray-300 mb-4">
                                Se encontraron {similarCards.length} tarjeta(s) con el mismo banco y nombre:
                                <br />
                                <span className="font-semibold">{pendingCardData.bank} • {pendingCardData.name}</span>
                                <br />
                                <span className="text-sm text-gray-500 dark:text-gray-400">
                                    Últimos 4 dígitos: **** **** **** {pendingCardData.cardNumber.slice(-4)}
                                </span>
                            </p>

                            <div className="space-y-3 mb-6">
                                {similarCards.map((card) => (
                                    <div key={card.id} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <p className="font-medium text-gray-900 dark:text-white">
                                                    {card.name}
                                                </p>
                                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                                    {card.bank} • **** **** **** {card.cardNumber.slice(-4)}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                                    Límite: ${card.limit?.toLocaleString() || 'N/A'}
                                                </p>
                                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                                    Saldo: ${card.currentBalance?.toLocaleString() || 'N/A'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                                <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
                                    ¿Qué deseas hacer?
                                </h4>
                                <div className="space-y-2 text-sm text-blue-700 dark:text-blue-300">
                                    <p>• <strong>Crear como nueva tarjeta:</strong> Se creará una tarjeta adicional con los mismos datos del banco y nombre</p>
                                    <p>• <strong>Actualizar tarjeta existente:</strong> Se actualizará una de las tarjetas existentes con los nuevos datos</p>
                                    <p>• <strong>Cancelar:</strong> No se realizará ninguna acción</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex space-x-3 justify-end">
                            <button
                                onClick={closeSimilarCardModal}
                                className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
                            >
                                Cancelar
                            </button>
                            {pendingCardData.isEditing && (
                                <button
                                    onClick={() => handleSimilarCardConfirm('update')}
                                    disabled={isSaving}
                                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
                                >
                                    {isSaving ? 'Actualizando...' : 'Actualizar Existente'}
                                </button>
                            )}
                            <button
                                onClick={() => handleSimilarCardConfirm('create')}
                                disabled={isSaving}
                                className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
                            >
                                {isSaving ? 'Creando...' : 'Crear como Nueva'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CreditCardManager;
