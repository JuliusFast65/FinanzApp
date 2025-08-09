import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { collection, getDocs, query, orderBy, deleteDoc, doc, updateDoc, getDocsFromServer } from 'firebase/firestore';
import { decryptText, encryptText } from '../utils/crypto';
import { loadUserCategoryPatterns, saveUserCategoryPattern } from '../utils/userCategoryPatterns';
import { TRANSACTION_CATEGORIES } from '../utils/transactionCategories';
import CategoryCorrectionModal from './CategoryCorrectionModal';

const StatementsView = ({ db, user, appId }) => {
    const { t } = useTranslation();
    const [statements, setStatements] = useState([]);
    const [cards, setCards] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedStatement, setSelectedStatement] = useState(null);
    const [filterCard, setFilterCard] = useState('');
    const [correctionModal, setCorrectionModal] = useState({
        isOpen: false,
        transaction: null,
        statementId: null
    });

    useEffect(() => {
        if (db && user && appId) {
            loadStatements();
            loadCards();
        }
    }, [db, user, appId]);

    // Resetear selección cuando cambie el filtro de tarjeta
    useEffect(() => {
        setSelectedStatement(null);
    }, [filterCard]);

    const loadCards = async () => {
        try {
            const cardsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'creditCards');
            const querySnapshot = await getDocs(cardsRef);
            
            const cardsData = [];
            for (const doc of querySnapshot.docs) {
                const data = doc.data();
                console.log(`🔍 Loading card ${doc.id}:`, data);
                
                try {
                    const decryptedCard = {
                        id: doc.id,
                        name: await decryptText(data.name, user.uid),
                        bank: await decryptText(data.bank, user.uid),
                        cardNumber: data.cardNumber ? await decryptText(data.cardNumber, user.uid) : '',
                    };
                    console.log(`✅ Card ${doc.id} decrypted:`, decryptedCard);
                    cardsData.push(decryptedCard);
                } catch (decryptError) {
                    console.error(`❌ Error decrypting card ${doc.id}:`, decryptError);
                    // Fallback con datos parciales
                    cardsData.push({
                        id: doc.id,
                        name: data.name || `Tarjeta ${doc.id}`,
                        bank: data.bank || 'Banco desconocido',
                        cardNumber: data.cardNumber || ''
                    });
                }
            }
            
            console.log('🎯 All cards loaded:', cardsData);
            setCards(cardsData);
        } catch (error) {
            console.error('Error cargando tarjetas:', error);
        }
    };

    const loadStatements = async () => {
        try {
            setIsLoading(true);
            const statementsPath = `artifacts/${appId}/users/${user.uid}/statements`;
            console.log('🔍 Buscando statements en:', statementsPath);
            
            const statementsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'statements');
            // Forzar lectura desde servidor para evitar problemas de cache
            let querySnapshot;
            try {
                console.log('🔄 Intentando con orderBy desde servidor...');
                const q = query(statementsRef, orderBy('analyzedAt', 'desc'));
                querySnapshot = await getDocsFromServer(q);
                console.log('✅ Lectura con orderBy desde servidor exitosa');
            } catch (orderError) {
                console.warn('⚠️ Error con orderBy, intentando sin orden desde servidor:', orderError);
                try {
                    querySnapshot = await getDocsFromServer(statementsRef);
                    console.log('✅ Lectura sin order desde servidor exitosa');
                } catch (serverError) {
                    console.warn('⚠️ Error desde servidor, usando cache local:', serverError);
                    querySnapshot = await getDocs(statementsRef);
                }
            }
            
            console.log('📊 Documentos encontrados:', querySnapshot.size);
            
            const statementsData = [];
            for (const doc of querySnapshot.docs) {
                const data = doc.data();
                console.log('📄 Documento statement:', doc.id, data);
                
                // Desencriptar transacciones si existen
                let transactions = [];
                if (data.transactions && Array.isArray(data.transactions)) {
                    transactions = await Promise.all(
                        data.transactions.map(async (transaction) => ({
                            ...transaction,
                            description: await decryptText(transaction.description, user.uid),
                            categoryData: transaction.category ? TRANSACTION_CATEGORIES[transaction.category] : null
                        }))
                    );
                }
                
                statementsData.push({
                    id: doc.id,
                    ...data,
                    transactions
                });
            }
            
            setStatements(statementsData);
            console.log('📊 Estados de cuenta cargados:', statementsData.length);
            if (statementsData.length > 0) {
                console.log('✅ Primer statement:', statementsData[0]);
            }
        } catch (error) {
            console.error('Error cargando estados de cuenta:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const deleteStatement = async (statementId) => {
        try {
            if (!confirm('¿Estás seguro de que quieres eliminar este estado de cuenta?')) {
                return;
            }
            
            await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'statements', statementId));
            setStatements(statements.filter(s => s.id !== statementId));
            
            if (selectedStatement?.id === statementId) {
                setSelectedStatement(null);
            }
        } catch (error) {
            console.error('Error eliminando estado de cuenta:', error);
        }
    };

    const handleCategoryCorrection = (transaction, statementId) => {
        setCorrectionModal({
            isOpen: true,
            transaction,
            statementId
        });
    };

    const handleCorrectionSaved = async (transaction, newCategory) => {
        try {
            const statementId = correctionModal.statementId;
            
            // Guardar patrón personalizado
            if (transaction.description && newCategory) {
                await saveUserCategoryPattern(db, user.uid, appId, transaction.description, newCategory, 'user');
            }
            
            // Actualizar transacción localmente
            setSelectedStatement(prevStatement => {
                if (!prevStatement) return null;
                
                const updatedTransactions = prevStatement.transactions.map(t => {
                    if (t.description === transaction.description && t.amount === transaction.amount) {
                        return {
                            ...t,
                            category: newCategory,
                            categoryMethod: 'user_pattern',
                            categoryData: TRANSACTION_CATEGORIES[newCategory]
                        };
                    }
                    return t;
                });
                
                return {
                    ...prevStatement,
                    transactions: updatedTransactions
                };
            });
            
            // Actualizar en la lista de statements
            setStatements(prevStatements => 
                prevStatements.map(statement => {
                    if (statement.id === statementId) {
                        const updatedTransactions = statement.transactions.map(t => {
                            if (t.description === transaction.description && t.amount === transaction.amount) {
                                return {
                                    ...t,
                                    category: newCategory,
                                    categoryMethod: 'user_pattern',
                                    categoryData: TRANSACTION_CATEGORIES[newCategory]
                                };
                            }
                            return t;
                        });
                        
                        return {
                            ...statement,
                            transactions: updatedTransactions
                        };
                    }
                    return statement;
                })
            );
            
            // Actualizar en Firestore (con transacciones encriptadas)
            const statementToUpdate = statements.find(s => s.id === statementId);
            if (statementToUpdate) {
                const encryptedTransactions = await Promise.all(
                    statementToUpdate.transactions.map(async (t) => {
                        if (t.description === transaction.description && t.amount === transaction.amount) {
                            return {
                                ...t,
                                description: await encryptText(t.description, user.uid),
                                category: newCategory,
                                categoryMethod: 'user_pattern'
                            };
                        }
                        return {
                            ...t,
                            description: await encryptText(t.description, user.uid)
                        };
                    })
                );
                
                await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'statements', statementId), {
                    transactions: encryptedTransactions
                });
            }

            setCorrectionModal({ isOpen: false, transaction: null, statementId: null });
        } catch (error) {
            console.error('Error procesando corrección:', error);
            alert('Error al guardar la corrección. Inténtalo de nuevo.');
        }
    };

    const filteredStatements = useMemo(() => {
        console.log(`📊 Filter Debug:
            - Total statements: ${statements.length}
            - Filter card ID: ${filterCard}
            - Available cards: ${cards.map(c => `${c.id}:${c.name}`).join(', ')}
        `);
        
        if (!filterCard) {
            console.log('✅ No filter applied, returning all statements');
            return statements;
        }
        
        const filtered = statements.filter(s => {
            const matches = s.cardId === filterCard;
            console.log(`Statement ${s.id}: cardId="${s.cardId}", filterCard="${filterCard}", matches=${matches}`);
            return matches;
        });
        
        console.log(`✅ Filter applied, ${filtered.length} statements match`);
        return filtered;
    }, [statements, filterCard, cards]);

    const getCardName = (cardId) => {
        const card = cards.find(c => c.id === cardId);
        return card ? `${card.name} - ${card.bank}` : 'Tarjeta no encontrada';
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                <span className="ml-3">Cargando estados de cuenta...</span>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto p-6">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                    Estados de Cuenta
                </h2>
                <div className="flex items-center space-x-4">
                    <select
                        value={filterCard}
                        onChange={(e) => setFilterCard(e.target.value)}
                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white"
                    >
                        <option value="">Todas las tarjetas</option>
                        {cards.map(card => (
                            <option key={card.id} value={card.id}>
                                {card.name}
                            </option>
                        ))}
                    </select>
                    
                    <button
                        onClick={loadStatements}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center space-x-2"
                        title="Recargar estados de cuenta"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <span>Recargar</span>
                    </button>
                </div>
            </div>

            {filteredStatements.length === 0 ? (
                <div className="text-center py-12">
                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                        {filterCard ? 'No hay estados de cuenta para esta tarjeta' : 'No hay estados de cuenta'}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {filterCard 
                            ? `No se encontraron estados de cuenta para la tarjeta seleccionada. Total de estados: ${statements.length}`
                            : 'Comienza analizando un PDF en la sección "Analizar PDF"'
                        }
                    </p>
                    {filterCard && (
                        <button
                            onClick={() => setFilterCard('')}
                            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
                        >
                            Mostrar Todas las Tarjetas
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Sidebar - Lista de Estados */}
                    <div className="lg:col-span-1">
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 h-fit">
                            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
                                    <svg className="w-5 h-5 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    Estados Procesados ({filteredStatements.length})
                                    {filterCard && (
                                        <span className="ml-2 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded-full">
                                            Filtrado
                                        </span>
                                    )}
                                </h3>
                            </div>
                            <div className="max-h-96 overflow-y-auto">
                                {filteredStatements.map((statement, index) => (
                                    <div
                                        key={statement.id}
                                        onClick={() => setSelectedStatement(statement)}
                                        className={`p-4 border-b border-gray-100 dark:border-gray-700 cursor-pointer transition-all hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                                            selectedStatement?.id === statement.id 
                                                ? 'bg-green-50 dark:bg-green-900/20 border-l-4 border-l-green-500' 
                                                : ''
                                        }`}
                                    >
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1 min-w-0">
                                                <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                                    {getCardName(statement.cardId)}
                                                </h4>
                                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                                    {statement.statementDate || 'Sin período'}
                                                </p>
                                                <div className="flex items-center justify-between mt-2 text-xs">
                                                    <span className="text-gray-500 dark:text-gray-400">
                                                        {statement.transactions?.length || 0} transacciones
                                                    </span>
                                                    <span className="text-green-600 dark:text-green-400 font-medium">
                                                        ${statement.totalBalance?.toLocaleString()}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                    {statement.analyzedAt ? new Date(statement.analyzedAt.toDate()).toLocaleDateString() : 'Sin fecha'}
                                                </div>
                                            </div>
                                            {selectedStatement?.id === statement.id && (
                                                <div className="ml-2 text-green-500">
                                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                    </svg>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Panel Principal - Detalles del Estado */}
                    <div className="lg:col-span-2">
                        {selectedStatement ? (
                            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
                                {/* Header del Estado Seleccionado */}
                                <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center space-x-3">
                                            <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                                                <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                                    {getCardName(selectedStatement.cardId)}
                                                </h3>
                                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                                    Período: {selectedStatement.statementDate || 'Sin fecha'}
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => deleteStatement(selectedStatement.id)}
                                            className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center space-x-2"
                                            title="Eliminar estado de cuenta"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                            <span className="hidden sm:inline">Eliminar</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Métricas del Estado */}
                                <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                        Resumen Financiero
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                                            <div className="flex items-center">
                                                <div className="w-8 h-8 bg-blue-100 dark:bg-blue-800 rounded-full flex items-center justify-center mr-3">
                                                    <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                                        Saldo Anterior
                                                    </div>
                                                    <div className="text-lg font-bold text-blue-700 dark:text-blue-300">
                                                        ${selectedStatement.previousBalance?.toLocaleString()}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                                            <div className="flex items-center">
                                                <div className="w-8 h-8 bg-red-100 dark:bg-red-800 rounded-full flex items-center justify-center mr-3">
                                                    <svg className="w-4 h-4 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 13l-5 5m0 0l-5-5m5 5V6" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <div className="text-xs text-red-600 dark:text-red-400 font-medium">
                                                        Total Gastos
                                                    </div>
                                                    <div className="text-lg font-bold text-red-700 dark:text-red-300">
                                                        ${selectedStatement.charges?.toLocaleString()}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                                            <div className="flex items-center">
                                                <div className="w-8 h-8 bg-green-100 dark:bg-green-800 rounded-full flex items-center justify-center mr-3">
                                                    <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                                                        Saldo Actual
                                                    </div>
                                                    <div className="text-lg font-bold text-green-700 dark:text-green-300">
                                                        ${selectedStatement.totalBalance?.toLocaleString()}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Tabla de Transacciones */}
                                <div className="p-6">
                                    <div className="flex justify-between items-center mb-4">
                                        <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                                            Transacciones ({selectedStatement.transactions?.length || 0})
                                        </h4>
                                        <div className="text-sm text-gray-600 dark:text-gray-400">
                                            🤖 = IA categorizada • ✏️ = Usuario personalizada
                                        </div>
                                    </div>
                                    
                                    {selectedStatement.transactions?.length > 0 ? (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead className="bg-gray-50 dark:bg-gray-700">
                                                    <tr>
                                                        <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">Fecha</th>
                                                        <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">Descripción</th>
                                                        <th className="px-4 py-3 text-right font-medium text-gray-700 dark:text-gray-300">Monto</th>
                                                        <th className="px-4 py-3 text-center font-medium text-gray-700 dark:text-gray-300">Categoría</th>
                                                        <th className="px-4 py-3 text-center font-medium text-gray-700 dark:text-gray-300">Acciones</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                                                    {selectedStatement.transactions.map((transaction, index) => (
                                                        <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                                            <td className="px-4 py-3 text-gray-900 dark:text-gray-100">
                                                                {transaction.date}
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <div className="max-w-xs truncate text-gray-900 dark:text-gray-100" title={transaction.description}>
                                                                    {transaction.description}
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3 text-right font-medium">
                                                                <span className={`${transaction.type === 'cargo' ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                                                                    ${transaction.amount?.toLocaleString()}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 text-center">
                                                                {transaction.categoryData ? (
                                                                    <span 
                                                                        className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-white"
                                                                        style={{ backgroundColor: transaction.categoryData.color }}
                                                                        title={`${transaction.categoryData.name} (${transaction.categoryMethod})`}
                                                                    >
                                                                        <span className="mr-1">{transaction.categoryData.icon}</span>
                                                                        {transaction.categoryData.name}
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                                                                        ❓ Sin categoría
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-3 text-center">
                                                                {transaction.type === 'cargo' && (
                                                                    <button
                                                                        onClick={() => handleCategoryCorrection(transaction, selectedStatement.id)}
                                                                        className="inline-flex items-center px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg transition-colors"
                                                                        title="Corregir categoría"
                                                                    >
                                                                        <span className="mr-1">
                                                                            {transaction.categoryMethod === 'user_pattern' ? '✏️' : '🤖'}
                                                                        </span>
                                                                        Editar
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="text-center py-8">
                                            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                            </svg>
                                            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                                                No hay transacciones
                                            </h3>
                                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                                Este estado de cuenta no tiene transacciones procesadas.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 h-96 flex items-center justify-center">
                                <div className="text-center">
                                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                                    </svg>
                                    <h3 className="mt-2 text-lg font-medium text-gray-900 dark:text-white">
                                        Selecciona un estado de cuenta
                                    </h3>
                                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                        Elige un estado de cuenta de la lista para ver sus detalles y editar categorías.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <CategoryCorrectionModal
                isOpen={correctionModal.isOpen}
                onClose={() => setCorrectionModal({ isOpen: false, transaction: null, statementId: null })}
                transaction={correctionModal.transaction}
                db={db}
                user={user}
                appId={appId}
                onCorrectionSaved={handleCorrectionSaved}
            />
        </div>
    );
};

export default StatementsView;
