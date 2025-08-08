import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { decryptText } from '../utils/crypto';
import { getCategoryStats, TRANSACTION_CATEGORIES } from '../utils/transactionCategories';
import {
    LineChart,
    Line,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';

const FinanceDashboard = ({ db, user, appId }) => {
    const { t } = useTranslation();
    const [cards, setCards] = useState([]);
    const [statements, setStatements] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedPeriod, setSelectedPeriod] = useState('month');

    // Colores para gráficos
    const COLORS = ['#059669', '#10B981', '#34D399', '#6EE7B7', '#A7F3D0', '#D1FAE5'];

    useEffect(() => {
        if (db && user) {
            loadDashboardData();
        }
    }, [db, user, selectedPeriod]);

    const loadDashboardData = async () => {
        try {
            setIsLoading(true);
            
            // Cargar tarjetas
            const cardsRef = collection(db, `artifacts/${appId}/users/${user.uid}/creditCards`);
            const cardsSnapshot = await getDocs(cardsRef);
            
            const cardsData = [];
            for (const doc of cardsSnapshot.docs) {
                const cardData = doc.data();
                try {
                    const decryptedCard = {
                        id: doc.id,
                        name: await decryptText(cardData.name, user.uid),
                        bank: await decryptText(cardData.bank, user.uid),
                        limit: parseFloat(cardData.limit || 0),
                        currentBalance: parseFloat(cardData.currentBalance || 0),
                        dueDate: cardData.dueDate,
                        closingDate: cardData.closingDate,
                        lastUpdated: cardData.lastUpdated
                    };
                    cardsData.push(decryptedCard);
                } catch (error) {
                    console.error('Error desencriptando tarjeta en dashboard:', doc.id, error);
                    // Fallback con datos sin encriptar
                    cardsData.push({
                        id: doc.id,
                        name: cardData.name || 'Tarjeta sin nombre',
                        bank: cardData.bank || 'Banco desconocido',
                        limit: parseFloat(cardData.limit || 0),
                        currentBalance: parseFloat(cardData.currentBalance || 0),
                        dueDate: cardData.dueDate,
                        closingDate: cardData.closingDate,
                        lastUpdated: cardData.lastUpdated
                    });
                }
            }
            
            setCards(cardsData);

            // Cargar estados de cuenta recientes
            const statementsRef = collection(db, `artifacts/${appId}/users/${user.uid}/statements`);
            const statementsQuery = query(statementsRef, orderBy('analyzedAt', 'desc'), limit(12));
            const statementsSnapshot = await getDocs(statementsQuery);
            
            const statementsData = [];
            const allTransactions = [];
            
            statementsSnapshot.forEach((doc) => {
                const statementData = doc.data();
                statementsData.push({
                    id: doc.id,
                    cardId: statementData.cardId,
                    statementDate: statementData.statementDate,
                    totalBalance: parseFloat(statementData.totalBalance),
                    minimumPayment: parseFloat(statementData.minimumPayment),
                    dueDate: statementData.dueDate,
                    creditLimit: parseFloat(statementData.creditLimit),
                    previousBalance: parseFloat(statementData.previousBalance),
                    payments: parseFloat(statementData.payments),
                    charges: parseFloat(statementData.charges),
                    fees: parseFloat(statementData.fees),
                    interest: parseFloat(statementData.interest),
                    analyzedAt: statementData.analyzedAt.toDate()
                });
                
                // Agregar transacciones si existen
                if (statementData.transactions && Array.isArray(statementData.transactions)) {
                    statementData.transactions.forEach(transaction => {
                        allTransactions.push({
                            ...transaction,
                            statementId: doc.id,
                            cardId: statementData.cardId,
                            statementDate: statementData.statementDate
                        });
                    });
                }
            });
            
            setStatements(statementsData);
            setTransactions(allTransactions);
        } catch (error) {
            console.error('Error loading dashboard data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Calcular métricas generales
    const calculateMetrics = () => {
        const totalLimit = cards.reduce((sum, card) => sum + card.limit, 0);
        const totalBalance = cards.reduce((sum, card) => sum + card.currentBalance, 0);
        const totalAvailable = totalLimit - totalBalance;
        const totalUtilization = totalLimit > 0 ? (totalBalance / totalLimit) * 100 : 0;
        
        // Calcular próximos vencimientos
        const today = new Date();
        const upcomingDueDates = cards
            .filter(card => {
                if (!card.dueDate) return false;
                const dueDate = new Date(card.dueDate);
                const daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
                return daysUntilDue >= 0 && daysUntilDue <= 30;
            })
            .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

        return {
            totalLimit,
            totalBalance,
            totalAvailable,
            totalUtilization,
            upcomingDueDates,
            totalCards: cards.length
        };
    };

    // Preparar datos de categorías
    const prepareCategoryData = () => {
        // Filtrar solo gastos (cargos) de los últimos 3 meses
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        
        const recentTransactions = transactions.filter(transaction => {
            const transactionDate = new Date(transaction.statementDate);
            return transactionDate >= threeMonthsAgo && 
                   transaction.type === 'cargo' && 
                   transaction.amount > 0;
        });
        
        if (recentTransactions.length === 0) {
            return null;
        }
        
        const categoryStats = getCategoryStats(recentTransactions);
        
        // Preparar datos para gráfico de pastel
        const categoryPieData = Object.entries(categoryStats.categories)
            .filter(([_, data]) => data.amount > 0)
            .map(([categoryKey, data]) => ({
                name: data.name,
                value: data.amount,
                color: data.color,
                icon: data.icon,
                count: data.count,
                percentage: data.percentage
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8); // Top 8 categorías
        
        // Preparar datos para gráfico de barras
        const categoryBarData = categoryPieData.map(item => ({
            name: item.name,
            amount: item.value,
            icon: item.icon,
            count: item.count
        }));
        
        return {
            pieData: categoryPieData,
            barData: categoryBarData,
            totalAmount: categoryStats.totalAmount,
            totalTransactions: categoryStats.totalTransactions,
            stats: categoryStats.categories
        };
    };

    // Preparar datos para gráficos
    const prepareChartData = () => {
        const metrics = calculateMetrics();
        const categoryData = prepareCategoryData();
        
        // Datos para gráfico de utilización por tarjeta
        const utilizationData = cards.map(card => ({
            name: card.name,
            utilization: card.limit > 0 ? (card.currentBalance / card.limit) * 100 : 0,
            balance: card.currentBalance,
            limit: card.limit
        }));

        // Datos para gráfico de evolución temporal (últimos 6 meses)
        const monthlyData = [];
        const last6Months = [];
        for (let i = 5; i >= 0; i--) {
            const date = new Date();
            date.setMonth(date.getMonth() - i);
            const monthKey = date.toISOString().slice(0, 7); // YYYY-MM
            last6Months.push(monthKey);
            
            // Agrupar estados de cuenta por mes
            const monthStatements = statements.filter(stmt => {
                const stmtMonth = stmt.analyzedAt.toISOString().slice(0, 7);
                return stmtMonth === monthKey;
            });
            
            const totalBalance = monthStatements.reduce((sum, stmt) => sum + stmt.totalBalance, 0);
            const totalCharges = monthStatements.reduce((sum, stmt) => sum + stmt.charges, 0);
            const totalPayments = monthStatements.reduce((sum, stmt) => sum + stmt.payments, 0);
            
            monthlyData.push({
                month: date.toLocaleDateString('es-ES', { month: 'short' }),
                balance: totalBalance,
                charges: totalCharges,
                payments: Math.abs(totalPayments)
            });
        }

        // Datos para gráfico de distribución por banco
        const bankDistribution = cards.reduce((acc, card) => {
            acc[card.bank] = (acc[card.bank] || 0) + card.currentBalance;
            return acc;
        }, {});

        const pieData = Object.entries(bankDistribution).map(([bank, balance], index) => ({
            name: bank,
            value: balance,
            color: COLORS[index % COLORS.length]
        }));

        return {
            utilizationData,
            monthlyData,
            pieData,
            metrics,
            categoryData
        };
    };

    const getUtilizationColor = (utilization) => {
        if (utilization < 30) return 'text-green-600';
        if (utilization < 70) return 'text-yellow-600';
        return 'text-red-600';
    };

    const getUtilizationBarColor = (utilization) => {
        if (utilization < 30) return '#059669';
        if (utilization < 70) return '#F59E0B';
        return '#DC2626';
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
            </div>
        );
    }

    const chartData = prepareChartData();

    return (
        <div className="space-y-6">
            {/* Métricas principales */}
            <div className={`grid grid-cols-1 md:grid-cols-2 ${chartData.categoryData ? 'lg:grid-cols-3 xl:grid-cols-5' : 'lg:grid-cols-4'} gap-4`}>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                    <div className="flex items-center">
                        <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                            </svg>
                        </div>
                        <div className="ml-4">
                            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                {t('dashboard.totalLimit')}
                            </p>
                            <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                ${chartData.metrics.totalLimit.toLocaleString()}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                    <div className="flex items-center">
                        <div className="p-2 bg-red-100 dark:bg-red-900 rounded-lg">
                            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <div className="ml-4">
                            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                {t('dashboard.totalBalance')}
                            </p>
                            <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                ${chartData.metrics.totalBalance.toLocaleString()}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                    <div className="flex items-center">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                            </svg>
                        </div>
                        <div className="ml-4">
                            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                {t('dashboard.availableCredit')}
                            </p>
                            <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                ${chartData.metrics.totalAvailable.toLocaleString()}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                    <div className="flex items-center">
                        <div className="p-2 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
                            <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                        </div>
                        <div className="ml-4">
                            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                {t('dashboard.utilization')}
                            </p>
                            <p className={`text-2xl font-bold ${getUtilizationColor(chartData.metrics.totalUtilization)}`}>
                                {chartData.metrics.totalUtilization.toFixed(1)}%
                            </p>
                        </div>
                    </div>
                </div>

                {/* Nueva métrica de gastos categorizados */}
                {chartData.categoryData && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                        <div className="flex items-center">
                            <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                                </svg>
                            </div>
                            <div className="ml-4">
                                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                    Gastos Categorizados
                                </p>
                                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                    ${chartData.categoryData.totalAmount.toLocaleString()}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {chartData.categoryData.totalTransactions} transacciones
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Gráficos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Gráfico de utilización por tarjeta */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        {t('dashboard.utilizationByCard')}
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={chartData.utilizationData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip 
                                formatter={(value, name) => [
                                    `${value.toFixed(1)}%`,
                                    t('dashboard.utilization')
                                ]}
                            />
                            <Bar 
                                dataKey="utilization" 
                                fill="#059669"
                                radius={[4, 4, 0, 0]}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Gráfico de evolución temporal */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        {t('dashboard.monthlyEvolution')}
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={chartData.monthlyData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="month" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Line 
                                type="monotone" 
                                dataKey="balance" 
                                stroke="#059669" 
                                strokeWidth={2}
                                name={t('dashboard.balance')}
                            />
                            <Line 
                                type="monotone" 
                                dataKey="charges" 
                                stroke="#DC2626" 
                                strokeWidth={2}
                                name={t('dashboard.charges')}
                            />
                            <Line 
                                type="monotone" 
                                dataKey="payments" 
                                stroke="#10B981" 
                                strokeWidth={2}
                                name={t('dashboard.payments')}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Gastos por Categoría */}
            {chartData.categoryData && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Gráfico de pastel - Categorías */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            Gastos por Categoría (Últimos 3 meses)
                        </h3>
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={chartData.categoryData.pieData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ name, percentage }) => `${name} ${percentage.toFixed(1)}%`}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="value"
                                >
                                    {chartData.categoryData.pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip 
                                    formatter={(value, name, props) => [
                                        `$${value.toLocaleString()}`,
                                        `${props.payload.icon} ${name}`
                                    ]}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="mt-4 text-center">
                            <p className="text-sm text-gray-600 dark:text-gray-300">
                                Total: ${chartData.categoryData.totalAmount.toLocaleString()} en {chartData.categoryData.totalTransactions} transacciones
                            </p>
                        </div>
                    </div>

                    {/* Gráfico de barras - Categorías */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            Top Categorías de Gasto
                        </h3>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={chartData.categoryData.barData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis 
                                    dataKey="name" 
                                    tick={{ fontSize: 12 }}
                                    interval={0}
                                    angle={-45}
                                    textAnchor="end"
                                    height={60}
                                />
                                <YAxis />
                                <Tooltip 
                                    formatter={(value, name, props) => [
                                        `$${value.toLocaleString()}`,
                                        `${props.payload.icon} ${name} (${props.payload.count} transacciones)`
                                    ]}
                                />
                                <Bar 
                                    dataKey="amount" 
                                    fill="#8884d8"
                                    radius={[4, 4, 0, 0]}
                                >
                                    {chartData.categoryData.barData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={chartData.categoryData.pieData[index]?.color || '#8884d8'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Lista detallada de categorías */}
            {chartData.categoryData && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        Resumen Detallado por Categoría
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {chartData.categoryData.pieData.map((category, index) => (
                            <div key={index} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center space-x-2">
                                        <span className="text-xl">{category.icon}</span>
                                        <span className="font-medium text-gray-900 dark:text-white">
                                            {category.name}
                                        </span>
                                    </div>
                                    <div 
                                        className="w-4 h-4 rounded-full"
                                        style={{ backgroundColor: category.color }}
                                    ></div>
                                </div>
                                <div className="space-y-1">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-600 dark:text-gray-300">Gasto:</span>
                                        <span className="font-semibold text-gray-900 dark:text-white">
                                            ${category.value.toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-600 dark:text-gray-300">Transacciones:</span>
                                        <span className="text-gray-900 dark:text-white">
                                            {category.count}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-600 dark:text-gray-300">Porcentaje:</span>
                                        <span className="text-gray-900 dark:text-white">
                                            {category.percentage.toFixed(1)}%
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-600 dark:text-gray-300">Promedio:</span>
                                        <span className="text-gray-900 dark:text-white">
                                            ${(category.value / category.count).toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Distribución por banco */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    {t('dashboard.distributionByBank')}
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={chartData.pieData}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey="value"
                            >
                                {chartData.pieData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value) => [`$${value.toLocaleString()}`, t('dashboard.balance')]} />
                        </PieChart>
                    </ResponsiveContainer>
                    
                    <div className="space-y-3">
                        {chartData.pieData.map((item, index) => (
                            <div key={index} className="flex items-center justify-between">
                                <div className="flex items-center">
                                    <div 
                                        className="w-4 h-4 rounded-full mr-3"
                                        style={{ backgroundColor: item.color }}
                                    ></div>
                                    <span className="text-gray-900 dark:text-white font-medium">
                                        {item.name}
                                    </span>
                                </div>
                                <span className="text-gray-600 dark:text-gray-300">
                                    ${item.value.toLocaleString()}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Próximos vencimientos */}
            {chartData.metrics.upcomingDueDates.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        {t('dashboard.upcomingDueDates')}
                    </h3>
                    <div className="space-y-3">
                        {chartData.metrics.upcomingDueDates.map((card, index) => {
                            const dueDate = new Date(card.dueDate);
                            const daysUntilDue = Math.ceil((dueDate - new Date()) / (1000 * 60 * 60 * 24));
                            
                            return (
                                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-white">
                                            {card.name}
                                        </p>
                                        <p className="text-sm text-gray-600 dark:text-gray-300">
                                            {card.bank}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-medium text-gray-900 dark:text-white">
                                            {card.dueDate}
                                        </p>
                                        <p className={`text-sm ${daysUntilDue <= 7 ? 'text-red-600' : 'text-gray-600 dark:text-gray-300'}`}>
                                            {daysUntilDue === 0 
                                                ? t('dashboard.dueToday')
                                                : daysUntilDue === 1 
                                                ? t('dashboard.dueTomorrow')
                                                : t('dashboard.daysUntilDue', { days: daysUntilDue })
                                            }
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default FinanceDashboard;
