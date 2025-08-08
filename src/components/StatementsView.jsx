import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { collection, getDocs, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { decryptText } from '../utils/crypto';

const StatementsView = ({ db, user, appId }) => {
    const { t } = useTranslation();
    const [statements, setStatements] = useState([]);
    const [cards, setCards] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedStatement, setSelectedStatement] = useState(null);
    const [filterCard, setFilterCard] = useState('');

    useEffect(() => {
        if (db && user) {
            loadData();
        }
    }, [db, user]);

    const loadData = async () => {
        try {
            setIsLoading(true);
            
            // Cargar tarjetas para el filtro
            const cardsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'creditCards');
            const cardsSnapshot = await getDocs(cardsRef);
            
            const cardsData = [];
            for (const doc of cardsSnapshot.docs) {
                const cardData = doc.data();
                try {
                    const decryptedCard = {
                        id: doc.id,
                        name: await decryptText(cardData.name, user.uid),
                        bank: await decryptText(cardData.bank, user.uid),
                        cardNumber: await decryptText(cardData.cardNumber, user.uid),
                    };
                    cardsData.push(decryptedCard);
                } catch (error) {
                    console.error('Error desencriptando tarjeta:', doc.id, error);
                    // Agregar tarjeta con datos sin encriptar como fallback
                    cardsData.push({
                        id: doc.id,
                        name: cardData.name || 'Tarjeta sin nombre',
                        bank: cardData.bank || 'Banco desconocido',
                        cardNumber: '****',
                    });
                }
            }
            setCards(cardsData);

            // Cargar estados de cuenta
            const statementsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'statements');
            const statementsQuery = query(statementsRef, orderBy('analyzedAt', 'desc'));
            const statementsSnapshot = await getDocs(statementsQuery);
            
            const statementsData = [];
            statementsSnapshot.forEach((doc) => {
                const data = doc.data();
                statementsData.push({
                    id: doc.id,
                    ...data,
                    analyzedAt: data.analyzedAt?.toDate() || new Date(),
                    createdAt: data.createdAt?.toDate() || new Date()
                });
            });
            
            setStatements(statementsData);
        } catch (error) {
            console.error('Error al cargar estados de cuenta:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const deleteStatement = async (statementId) => {
        if (!confirm('¿Estás seguro de que quieres eliminar este estado de cuenta?')) return;
        
        try {
            await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'statements', statementId));
            setStatements(statements.filter(s => s.id !== statementId));
            setSelectedStatement(null);
            alert('Estado de cuenta eliminado exitosamente');
        } catch (error) {
            console.error('Error al eliminar estado de cuenta:', error);
            alert('Error al eliminar estado de cuenta');
        }
    };

    const filteredStatements = filterCard 
        ? statements.filter(s => s.cardId === filterCard)
        : statements;

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
            <div className="mb-6">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                    Estados de Cuenta Analizados
                </h2>
                <p className="text-gray-600 dark:text-gray-300">
                    Revisa todos los estados de cuenta que has procesado
                </p>
            </div>

            {/* Filtros */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Filtrar por tarjeta
                        </label>
                        <select
                            value={filterCard}
                            onChange={(e) => setFilterCard(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white"
                        >
                            <option value="">Todas las tarjetas</option>
                            {cards.map((card) => (
                                <option key={card.id} value={card.id}>
                                    {card.name} - {card.bank} (****{card.cardNumber.slice(-4)})
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-end">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                            {filteredStatements.length} estado(s) de cuenta
                        </span>
                    </div>
                </div>
            </div>

            {/* Lista de estados de cuenta */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Lista */}
                <div className="space-y-4">
                    {filteredStatements.length === 0 ? (
                        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-8 text-center">
                            <p className="text-gray-500 dark:text-gray-400">
                                No se encontraron estados de cuenta
                            </p>
                        </div>
                    ) : (
                        filteredStatements.map((statement) => (
                            <div
                                key={statement.id}
                                className={`bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 cursor-pointer transition-all hover:shadow-lg border-2 ${
                                    selectedStatement?.id === statement.id
                                        ? 'border-green-500'
                                        : 'border-transparent'
                                }`}
                                onClick={() => setSelectedStatement(statement)}
                            >
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <h3 className="font-semibold text-gray-900 dark:text-white">
                                            {getCardName(statement.cardId)}
                                        </h3>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">
                                            {statement.bankName}
                                        </p>
                                    </div>
                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                        {statement.analyzedAt.toLocaleDateString()}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="text-gray-600 dark:text-gray-400">Saldo Total:</span>
                                        <p className="font-semibold text-gray-900 dark:text-white">
                                            ${statement.totalBalance?.toLocaleString() || '0'}
                                        </p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600 dark:text-gray-400">Pago Mínimo:</span>
                                        <p className="font-semibold text-gray-900 dark:text-white">
                                            ${statement.minimumPayment?.toLocaleString() || '0'}
                                        </p>
                                    </div>
                                </div>

                                {statement.dueDate && (
                                    <div className="mt-2">
                                        <span className="text-xs text-gray-600 dark:text-gray-400">
                                            Fecha límite: {statement.dueDate}
                                        </span>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                {/* Detalle */}
                <div className="lg:sticky lg:top-6">
                    {selectedStatement ? (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <div className="flex justify-between items-start mb-4">
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                    Detalle del Estado de Cuenta
                                </h3>
                                <button
                                    onClick={() => deleteStatement(selectedStatement.id)}
                                    className="text-red-600 hover:text-red-800 text-sm"
                                >
                                    Eliminar
                                </button>
                            </div>

                            <div className="space-y-4">
                                {/* Información general */}
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="text-gray-600 dark:text-gray-400">Tarjeta:</span>
                                        <p className="font-semibold">{getCardName(selectedStatement.cardId)}</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600 dark:text-gray-400">Banco:</span>
                                        <p className="font-semibold">{selectedStatement.bankName || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600 dark:text-gray-400">Titular:</span>
                                        <p className="font-semibold">{selectedStatement.cardHolderName || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600 dark:text-gray-400">Últimos dígitos:</span>
                                        <p className="font-semibold">****{selectedStatement.lastFourDigits || 'N/A'}</p>
                                    </div>
                                </div>

                                {/* Saldos */}
                                <div className="border-t pt-4">
                                    <h4 className="font-semibold mb-3">Información Financiera</h4>
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div>
                                            <span className="text-gray-600 dark:text-gray-400">Saldo Total:</span>
                                            <p className="font-semibold text-lg">${selectedStatement.totalBalance?.toLocaleString() || '0'}</p>
                                        </div>
                                        <div>
                                            <span className="text-gray-600 dark:text-gray-400">Pago Mínimo:</span>
                                            <p className="font-semibold text-lg">${selectedStatement.minimumPayment?.toLocaleString() || '0'}</p>
                                        </div>
                                        <div>
                                            <span className="text-gray-600 dark:text-gray-400">Límite de Crédito:</span>
                                            <p className="font-semibold">${selectedStatement.creditLimit?.toLocaleString() || '0'}</p>
                                        </div>
                                        <div>
                                            <span className="text-gray-600 dark:text-gray-400">Crédito Disponible:</span>
                                            <p className="font-semibold">${selectedStatement.availableCredit?.toLocaleString() || '0'}</p>
                                        </div>
                                        <div>
                                            <span className="text-gray-600 dark:text-gray-400">Saldo Anterior:</span>
                                            <p className="font-semibold">${selectedStatement.previousBalance?.toLocaleString() || '0'}</p>
                                        </div>
                                        <div>
                                            <span className="text-gray-600 dark:text-gray-400">Pagos:</span>
                                            <p className="font-semibold">${selectedStatement.payments?.toLocaleString() || '0'}</p>
                                        </div>
                                        <div>
                                            <span className="text-gray-600 dark:text-gray-400">Nuevos Cargos:</span>
                                            <p className="font-semibold">${selectedStatement.charges?.toLocaleString() || '0'}</p>
                                        </div>
                                        <div>
                                            <span className="text-gray-600 dark:text-gray-400">Intereses:</span>
                                            <p className="font-semibold">${selectedStatement.interest?.toLocaleString() || '0'}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Fechas */}
                                <div className="border-t pt-4">
                                    <h4 className="font-semibold mb-3">Fechas Importantes</h4>
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div>
                                            <span className="text-gray-600 dark:text-gray-400">Fecha del Estado:</span>
                                            <p className="font-semibold">{selectedStatement.statementDate || 'N/A'}</p>
                                        </div>
                                        <div>
                                            <span className="text-gray-600 dark:text-gray-400">Fecha Límite:</span>
                                            <p className="font-semibold">{selectedStatement.dueDate || 'N/A'}</p>
                                        </div>
                                        <div>
                                            <span className="text-gray-600 dark:text-gray-400">Analizado:</span>
                                            <p className="font-semibold">{selectedStatement.analyzedAt.toLocaleString()}</p>
                                        </div>
                                        <div>
                                            <span className="text-gray-600 dark:text-gray-400">Archivo:</span>
                                            <p className="font-semibold">{selectedStatement.fileName || 'N/A'}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Transacciones */}
                                {selectedStatement.transactions && selectedStatement.transactions.length > 0 && (
                                    <div className="border-t pt-4">
                                        <h4 className="font-semibold mb-3">
                                            Transacciones ({selectedStatement.transactions.length})
                                        </h4>
                                        <div className="max-h-60 overflow-y-auto">
                                            <table className="w-full text-xs">
                                                <thead className="bg-gray-50 dark:bg-gray-700">
                                                    <tr>
                                                        <th className="px-2 py-1 text-left">Fecha</th>
                                                        <th className="px-2 py-1 text-left">Descripción</th>
                                                        <th className="px-2 py-1 text-right">Monto</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {selectedStatement.transactions.map((transaction, index) => (
                                                        <tr key={index} className="border-t dark:border-gray-600">
                                                            <td className="px-2 py-1">{transaction.date}</td>
                                                            <td className="px-2 py-1 truncate">{transaction.description}</td>
                                                            <td className="px-2 py-1 text-right">
                                                                ${transaction.amount?.toLocaleString()}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-8 text-center">
                            <p className="text-gray-500 dark:text-gray-400">
                                Selecciona un estado de cuenta para ver los detalles
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StatementsView;
