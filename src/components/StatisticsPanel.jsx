import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, documentId, getDocs } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useTranslation } from 'react-i18next';

const StatisticsPanel = ({ db, userId, appId, activities, subscription, onUpgradeClick, currentTheme }) => {
    const { t } = useTranslation();
    const [rawEntries, setRawEntries] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedActivityId, setSelectedActivityId] = useState(null);
    const [selectedRange, setSelectedRange] = useState('this_week');

    const dateRanges = useMemo(() => {
        // Función para obtener la fecha local en formato YYYY-MM-DD
        const getLocalFormattedDate = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };
        
        // Obtener la fecha actual en la zona horaria local
        const today = new Date();
        
        const ranges = {
            this_week: {
                name: t('statistics.dateRanges.this_week'),
                startDate: (() => {
                    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
                    // Calcular días para llegar al domingo (inicio de semana)
                    const daysToSubtract = dayOfWeek; // Si es domingo (0), no restar días
                    const sunday = new Date(today);
                    sunday.setDate(today.getDate() - daysToSubtract);
                    const startDate = getLocalFormattedDate(sunday);
                    return startDate;
                })(),
                endDate: (() => {
                    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
                    // Calcular días para llegar al sábado (fin de semana)
                    const daysToAdd = 6 - dayOfWeek; // Si es domingo (0), sumar 6 días para llegar al sábado
                    const saturday = new Date(today);
                    saturday.setDate(today.getDate() + daysToAdd);
                    const endDate = getLocalFormattedDate(saturday);
                    return endDate;
                })()
            },
            this_month: {
                name: t('statistics.dateRanges.this_month'),
                startDate: getLocalFormattedDate(new Date(today.getFullYear(), today.getMonth(), 1)),
                endDate: getLocalFormattedDate(today)
            },
            this_year: {
                name: t('statistics.dateRanges.this_year'),
                startDate: getLocalFormattedDate(new Date(today.getFullYear(), 0, 1)),
                endDate: getLocalFormattedDate(today)
            },
            last_year: {
                name: t('statistics.dateRanges.last_year'),
                startDate: getLocalFormattedDate(new Date(today.getFullYear() - 1, 0, 1)),
                endDate: getLocalFormattedDate(new Date(today.getFullYear() - 1, 11, 31))
            },
            since_last_year: {
                name: t('statistics.dateRanges.since_last_year'),
                startDate: getLocalFormattedDate(new Date(today.getFullYear() - 1, 0, 1)),
                endDate: getLocalFormattedDate(today)
            }
        };
        
        return ranges;
    }, [t, new Date().toDateString()]); // Force recalculation daily

    const { startDate, endDate } = dateRanges[selectedRange];

    // Debug logs for date range calculation
    const getLocalFormattedDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    
    console.log('🔍 StatisticsPanel Debug:');
    console.log('  - selectedRange:', selectedRange);
    console.log('  - startDate:', startDate);
    console.log('  - endDate:', endDate);
    console.log('  - Today (local):', getLocalFormattedDate(new Date()));
    console.log('  - Today (UTC):', new Date().toISOString().split('T')[0]);
    
    // Additional debugging for this_week calculation
    if (selectedRange === 'this_week') {
        const today = new Date();
        const dayOfWeek = today.getDay();
        console.log('🔍 This week calculation details:');
        console.log('  - Today (local):', getLocalFormattedDate(today));
        console.log('  - Day of week:', dayOfWeek, '(0=Sunday, 1=Monday, etc.)');
        console.log('  - Days to subtract for Sunday (start):', dayOfWeek);
        console.log('  - Days to add for Saturday (end):', 6 - dayOfWeek);
    }

    useEffect(() => {
        const fetchEntries = async () => {
            if (!db || !userId || !startDate || !endDate) return;
            setIsLoading(true);
            setError(null);
            try {
                const entriesRef = collection(db, 'artifacts', appId, 'users', userId, 'entries');
                
                // Intentar la consulta con filtros de fecha
                let entries = [];
                try {
                    console.log('🔍 Querying with date range:', startDate, 'to', endDate);
                    const entriesQuery = query(entriesRef, where(documentId(), '>=', startDate), where(documentId(), '<=', endDate));
                    const querySnapshot = await getDocs(entriesQuery);
                    entries = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    console.log('🔍 Query successful, found entries:', entries.length);
                    console.log('🔍 Entry IDs:', entries.map(e => e.id));
                } catch (queryError) {
                    console.warn('⚠️ Date filter query failed, fetching all entries:', queryError);
                    // Fallback: obtener todas las entradas y filtrar en memoria
                    const allEntriesQuery = query(entriesRef);
                    const allQuerySnapshot = await getDocs(allEntriesQuery);
                    const allEntries = allQuerySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    console.log('🔍 All entries found:', allEntries.length);
                    console.log('🔍 All entry IDs:', allEntries.map(e => e.id));
                    entries = allEntries.filter(entry => entry.id >= startDate && entry.id <= endDate);
                    console.log('🔍 After filtering, entries:', entries.length);
                    console.log('🔍 Filtered entry IDs:', entries.map(e => e.id));
                }
                
                setRawEntries(entries);
            } catch (err) {
                console.error("Error fetching statistics:", err);
                setError(t('statistics.errorLoadingStatistics'));
            } finally {
                setIsLoading(false);
            }
        };
        fetchEntries();
    }, [db, userId, appId, startDate, endDate, t]);

    const handleBarClick = (data) => {
        // Verificar si el usuario es premium
        if (subscription?.plan !== 'premium') {
            // Mostrar modal de características premium
            if (onUpgradeClick) {
                onUpgradeClick();
            }
            return;
        }
        
        let activityId = null;
        if (data && data.activeLabel) {
            activityId = Object.keys(activities).find(id => activities[id]?.name === data.activeLabel);
        } else if (data && data.activePayload && data.activePayload[0]) {
            activityId = data.activePayload[0].payload.id;
        }
        if (activityId && activities[activityId]) {
            setSelectedActivityId(activityId);
        }
    };

    if (isLoading) return (
        <div className={`p-8 text-center ${currentTheme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            {t('statistics.loadingStatistics')}
        </div>
    );
    if (error) return (
        <div className={`p-8 text-center ${currentTheme === 'dark' ? 'text-red-400' : 'text-red-600'}`}>
            {error}
        </div>
    );

    if (selectedActivityId) {
        return (
            <ActivityDetailView 
                activity={activities[selectedActivityId]} 
                entries={rawEntries} 
                onBack={() => setSelectedActivityId(null)}
                currentTheme={currentTheme}
            />
        );
    }

    return (
        <StatisticsOverview 
            rawEntries={rawEntries} 
            activities={activities} 
            onBarClick={handleBarClick} 
            dateRanges={dateRanges} 
            selectedRange={selectedRange} 
            onRangeChange={setSelectedRange} 
            subscription={subscription} 
            onUpgradeClick={onUpgradeClick}
            currentTheme={currentTheme}
        />
    );
};

// --- StatisticsOverview ---
const StatisticsOverview = ({ rawEntries, activities, onBarClick, dateRanges, selectedRange, onRangeChange, subscription, onUpgradeClick, currentTheme }) => {
    const { t } = useTranslation();
    const [chartType, setChartType] = useState('bars');
    const [showGoals, setShowGoals] = useState(true);

    const overviewData = useMemo(() => {
        const activityStats = {};
        rawEntries.forEach(entry => {
            if (entry.tracked) {
                Object.entries(entry.tracked).forEach(([activityId, option]) => {
                    if (!activityStats[activityId]) {
                        activityStats[activityId] = {
                            id: activityId,
                            name: activities[activityId]?.name || t('statistics.unknownActivity'),
                            totalPoints: 0,
                            totalCount: 0,
                            daysCount: 0,
                            goal: activities[activityId]?.goal,
                            isSimple: !activities[activityId]?.options || activities[activityId].options.length === 0
                        };
                    }
                    
                    const activity = activities[activityId];
                    const isSimple = !activity?.options || activity.options.length === 0;
                    
                    if (isSimple) {
                        // Para actividades simples: contar veces
                        activityStats[activityId].totalCount += 1;
                    } else {
                        // Para actividades con subniveles: usar puntos
                        const points = activity?.points?.[option] || 0;
                        activityStats[activityId].totalPoints += points;
                    }
                    activityStats[activityId].daysCount += 1;
                });
            }
        });
        
        Object.values(activityStats).forEach(activity => {
            if (activity.goal) {
                const goalTarget = activity.goal.target;
                if (activity.isSimple) {
                    // Para actividades simples: metas por veces
                    activity.completionPercentage = Math.round((activity.totalCount / goalTarget) * 100);
                    activity.isGoalMet = activity.totalCount >= goalTarget;
                } else {
                    // Para actividades con subniveles: metas por puntos
                    activity.completionPercentage = Math.round((activity.totalPoints / goalTarget) * 100);
                    activity.isGoalMet = activity.totalPoints >= goalTarget;
                }
            }
        });
        
        const result = Object.values(activityStats)
            .sort((a, b) => {
                // Ordenar por el valor relevante (puntos o conteo)
                const aValue = a.isSimple ? a.totalCount : a.totalPoints;
                const bValue = b.isSimple ? b.totalCount : b.totalPoints;
                return bValue - aValue;
            });
            
        return result;
    }, [rawEntries, activities, t]);

    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className={`${currentTheme === 'dark' ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-300'} border rounded-lg p-3 shadow-lg`}>
                    <p className={`font-semibold ${currentTheme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{data.name}</p>
                    {data.isSimple ? (
                        <p className={`${currentTheme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>{t('statistics.tooltip.timesPerformed')}: <span className="text-green-400 font-bold">{data.totalCount}</span></p>
                    ) : (
                        <p className={`${currentTheme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>{t('statistics.tooltip.totalPoints')}: <span className="text-green-400 font-bold">{data.totalPoints}</span></p>
                    )}
                    <p className={`${currentTheme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>{t('statistics.tooltip.registeredDays')}: <span className="text-blue-400">{data.daysCount}</span></p>
                    {data.goal && (
                        <div className={`mt-2 pt-2 border-t ${currentTheme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`}>
                            <p className="text-yellow-300">
                                {t('statistics.tooltip.goal')}: {data.goal.target} {data.isSimple ? t('statistics.tooltip.times') : t('statistics.tooltip.points')}
                            </p>
                            <p className={`font-bold ${data.isGoalMet ? 'text-green-400' : 'text-red-400'}`}>
                                {data.completionPercentage}% {t('statistics.tooltip.completed')}{data.isGoalMet ? ' ✅' : ' ❌'}
                            </p>
                        </div>
                    )}
                </div>
            );
        }
        return null;
    };

    return (
        <div className="p-4 md:p-6 space-y-6">
            <div className={`${currentTheme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-lg p-6 border ${currentTheme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
                    <h3 className={`text-xl font-semibold ${currentTheme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                        {t('statistics.performanceTitle')}
                    </h3>
                    <div className="flex items-center gap-4">
                        <select
                            value={selectedRange}
                            onChange={(e) => onRangeChange(e.target.value)}
                            className={`${currentTheme === 'dark' ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-900 border-gray-300'} rounded-md p-2 border`}
                        >
                            {Object.entries(dateRanges).map(([key, value]) => (
                                <option key={key} value={key}>{value.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
                {overviewData.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {overviewData.map(activity => (
                            <div 
                                key={activity.id} 
                                className={`${currentTheme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-50 hover:bg-gray-100'} p-4 rounded-lg cursor-pointer transition-colors border ${currentTheme === 'dark' ? 'border-gray-600' : 'border-gray-200'}`}
                                onClick={() => {
                                    if (subscription?.plan !== 'premium') {
                                        if (onUpgradeClick) {
                                            onUpgradeClick();
                                        }
                                    } else {
                                        onBarClick({ activePayload: [{ payload: activity }] });
                                    }
                                }}
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <span className={`font-medium text-lg ${currentTheme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{activity.name}</span>
                                    {activity.goal && (
                                        <span className={`text-sm font-bold ${activity.isGoalMet ? 'text-green-400' : 'text-red-400'}`}>{activity.isGoalMet ? '✅' : '❌'}</span>
                                    )}
                                </div>
                                <div className={`text-sm space-y-2 ${currentTheme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                    <div className="flex justify-between">
                                        <span>{activity.isSimple ? t('statistics.tooltip.times') : t('statistics.tooltip.points')}:</span>
                                        <span className="text-green-400 font-bold">
                                            {activity.isSimple ? activity.totalCount : activity.totalPoints}
                                        </span>
                                    </div>
                                    {activity.goal && (
                                        <>
                                            <div className="flex justify-between">
                                                <span>{t('statistics.tooltip.goal')}:</span>
                                                <span className="text-yellow-400">
                                                    {activity.goal.target} {activity.isSimple ? t('statistics.tooltip.times') : t('statistics.tooltip.points')}
                                                </span>
                                            </div>
                                            <div className="mt-2">
                                                <div className={`w-full rounded-full h-2 ${currentTheme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'}`}>
                                                    <div 
                                                        className={`h-2 rounded-full ${activity.isGoalMet ? 'bg-green-500' : 'bg-red-500'}`}
                                                        style={{ width: `${Math.min(activity.completionPercentage, 100)}%` }}
                                                    ></div>
                                                </div>
                                                <span className="text-xs">{activity.completionPercentage}%</span>
                                            </div>
                                        </>
                                    )}
                                    <div className={`text-xs mt-2 ${currentTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                                        {subscription?.plan === 'premium' ? t('statistics.clickForDetails') : t('statistics.clickForDetailsPremium')}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className={`text-center py-8 ${currentTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                        <p className="text-lg font-semibold mb-2">{t('statistics.noDataForRange')}</p>
                        <p className="text-sm">
                            {selectedRange === 'this_week' && t('statistics.noDataThisWeek')}
                            {selectedRange === 'this_month' && t('statistics.noDataThisMonth')}
                            {selectedRange === 'this_year' && t('statistics.noDataThisYear')}
                            {selectedRange === 'last_year' && t('statistics.noDataLastYear')}
                            {selectedRange === 'since_last_year' && t('statistics.noDataSinceLastYear')}
                        </p>
                        <p className="text-xs mt-2 opacity-75">
                            {t('statistics.tipRegisterActivities')}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- ActivityDetailView ---
const ActivityDetailView = ({ activity, entries, onBack, currentTheme }) => {
    const { t } = useTranslation();
    const [timeGroup, setTimeGroup] = useState('weekly');
    const [selectedPeriod, setSelectedPeriod] = useState(null);

    const processedData = useMemo(() => {
        if (!activity || !entries) return [];
        const getWeek = (d) => {
            const date = new Date(d.getTime());
            date.setHours(0, 0, 0, 0);
            date.setDate(date.getDate() + 4 - (date.getDay() || 7));
            const yearStart = new Date(date.getFullYear(), 0, 1);
            const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
            return `${date.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
        };
        const getMonth = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const relevantEntries = entries.filter(e => e.tracked && e.tracked[activity.id]);
        const isSimple = !activity.options || activity.options.length === 0;
        
        const groupedData = relevantEntries.reduce((acc, entry) => {
            const date = new Date(`${entry.id}T00:00:00`);
            const key = timeGroup === 'weekly' ? getWeek(date) : getMonth(date);
            const option = entry.tracked[activity.id] || 'N/A';
            
            if (!acc[key]) {
                acc[key] = { 
                    timePeriod: key, 
                    totalPoints: 0,
                    totalCount: 0,
                    daysCount: 0,
                    activities: []
                };
            }
            
            if (isSimple) {
                // Para actividades simples: contar veces
                acc[key].totalCount += 1;
            } else {
                // Para actividades con subniveles: usar puntos
                const points = activity.points?.[option] || 0;
                acc[key].totalPoints += points;
            }
            
            acc[key].daysCount += 1;
            acc[key].activities.push({
                date: entry.id,
                option: option,
                points: isSimple ? 1 : (activity.points?.[option] || 0)
            });
            return acc;
        }, {});
        return Object.values(groupedData).sort((a,b) => a.timePeriod.localeCompare(b.timePeriod));
    }, [activity, entries, timeGroup]);

    const calculateGoalForPeriod = useMemo(() => {
        if (!activity.goal || processedData.length === 0) return null;
        const { type, target } = activity.goal;
        const isSimple = !activity.options || activity.options.length === 0;
        
        if (type === 'weekly') {
            const weeksCount = processedData.length;
            return target * weeksCount;
        } else if (type === 'monthly') {
            const monthsCount = processedData.length;
            return target * monthsCount;
        } else if (type === 'custom') {
            return target;
        }
        return null;
    }, [activity.goal, processedData]);

    const isSimple = !activity.options || activity.options.length === 0;
    const totalValue = isSimple 
        ? processedData.reduce((sum, period) => sum + period.totalCount, 0)
        : processedData.reduce((sum, period) => sum + period.totalPoints, 0);
    const goalMet = calculateGoalForPeriod ? totalValue >= calculateGoalForPeriod : false;
    const completionPercentage = calculateGoalForPeriod ? Math.round((totalValue / calculateGoalForPeriod) * 100) : 0;

    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className={`${currentTheme === 'dark' ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-300'} border rounded-lg p-3 shadow-lg`}>
                    <p className={`font-semibold ${currentTheme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{data.timePeriod}</p>
                    {isSimple ? (
                        <p className={`${currentTheme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>{t('statistics.tooltip.times')}: <span className="text-green-400 font-bold">{data.totalCount}</span></p>
                    ) : (
                        <p className={`${currentTheme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>{t('statistics.tooltip.points')}: <span className="text-green-400 font-bold">{data.totalPoints}</span></p>
                    )}
                    <p className={`${currentTheme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>{t('statistics.tooltip.days')}: <span className="text-blue-400">{data.daysCount}</span></p>
                </div>
            );
        }
        return null;
    };

    const handlePeriodClick = (data) => {
        if (data && data.activePayload && data.activePayload[0]) {
            setSelectedPeriod(data.activePayload[0].payload);
        }
    };

    if (selectedPeriod) {
        return (
            <ActivityPeriodDetail 
                period={selectedPeriod} 
                activity={activity} 
                onBack={() => setSelectedPeriod(null)}
                currentTheme={currentTheme}
            />
        );
    }

    return (
        <div className="p-4 md:p-6">
            <button onClick={onBack} className="text-indigo-400 hover:text-indigo-300 mb-4 inline-flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                {t('statistics.backToSummary')}
            </button>
            <div className={`${currentTheme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-lg p-6 border ${currentTheme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className="mb-6">
                    <h3 className={`text-xl font-semibold mb-4 ${currentTheme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                        {t('statistics.detailedAnalysis')}: {activity.name}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div className={`text-center p-4 rounded-lg ${currentTheme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'}`}>
                            <div className="text-2xl font-bold text-green-400">{totalValue}</div>
                            <div className={`text-sm ${currentTheme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                {isSimple ? t('statistics.totalTimes') : t('statistics.totalPoints')}
                            </div>
                        </div>
                        <div className={`text-center p-4 rounded-lg ${currentTheme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'}`}>
                            <div className="text-2xl font-bold text-blue-400">{processedData.length}</div>
                            <div className={`text-sm ${currentTheme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>{timeGroup === 'weekly' ? t('statistics.weeks') : t('statistics.months')}</div>
                        </div>
                        {calculateGoalForPeriod && (
                            <div className="text-center">
                                <div className="text-2xl font-bold text-yellow-400">{calculateGoalForPeriod}</div>
                                <div className={`text-sm ${currentTheme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                    {t('statistics.periodGoal')} ({isSimple ? t('statistics.times') : t('statistics.points')})
                                </div>
                                <div className={`text-sm font-bold ${goalMet ? 'text-green-400' : 'text-red-400'}`}>{completionPercentage}% {goalMet ? '✅' : '❌'}</div>
                            </div>
                        )}
                    </div>
                </div>
                {processedData.length > 0 ? (
                    <div>
                        <div style={{ width: '100%', height: 400 }}>
                            <ResponsiveContainer>
                                <BarChart data={processedData} margin={{top: 20, right: 30, left: 20, bottom: 5}} onClick={handlePeriodClick}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={currentTheme === 'dark' ? '#4A5568' : '#E2E8F0'}/>
                                    <XAxis dataKey="timePeriod" stroke={currentTheme === 'dark' ? '#A0AEC0' : '#4A5568'} tick={{fontSize: 12}}/>
                                    <YAxis stroke={currentTheme === 'dark' ? '#A0AEC0' : '#4A5568'} allowDecimals={false}/>
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend wrapperStyle={{ color: currentTheme === 'dark' ? '#E2E8F0' : '#2D3748' }} />
                                    <Bar 
                                        dataKey={isSimple ? "totalCount" : "totalPoints"} 
                                        name={isSimple ? t('statistics.chartLabels.totalTimes') : t('statistics.chartLabels.totalPoints')} 
                                        fill="#667EEA" 
                                        cursor="pointer"
                                        radius={[4, 4, 0, 0]}
                                    />
                                    {calculateGoalForPeriod && (
                                        <ReferenceLine 
                                            y={calculateGoalForPeriod} 
                                            stroke="#FFD700" 
                                            strokeDasharray="3 3" 
                                            strokeWidth={2}
                                            label={{ value: t('statistics.chartLabels.goal'), position: 'insideTopRight', fill: '#FFD700' }}
                                        />
                                    )}
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                ) : (
                    <p className={`text-center italic ${currentTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                        {t('statistics.noDataForActivity')}
                    </p>
                )}
            </div>
        </div>
    );
};

// --- ActivityPeriodDetail ---
const ActivityPeriodDetail = ({ period, activity, onBack, currentTheme }) => {
    const { t } = useTranslation();
    const isSimple = !activity.options || activity.options.length === 0;
    const totalValue = period.activities.reduce((sum, act) => sum + act.points, 0);
    
    return (
        <div className="p-4 md:p-6">
            <button onClick={onBack} className="text-indigo-400 hover:text-indigo-300 mb-4 inline-flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                {t('statistics.backToAnalysis')} {activity.name}
            </button>
            <div className={`${currentTheme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-lg p-6 border ${currentTheme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className="mb-6">
                    <h3 className={`text-xl font-semibold mb-2 ${currentTheme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                        {t('statistics.periodDetail')}: {period.timePeriod}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className={`text-center p-3 rounded-lg ${currentTheme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'}`}>
                            <div className="text-2xl font-bold text-green-400">{totalValue}</div>
                            <div className={`text-sm ${currentTheme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                {isSimple ? t('statistics.totalTimesPeriod') : t('statistics.totalPointsPeriod')}
                            </div>
                        </div>
                        <div className={`text-center p-3 rounded-lg ${currentTheme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'}`}>
                            <div className="text-2xl font-bold text-blue-400">{period.daysCount}</div>
                            <div className={`text-sm ${currentTheme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>{t('statistics.registeredDays')}</div>
                        </div>
                        <div className={`text-center p-3 rounded-lg ${currentTheme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'}`}>
                            <div className="text-2xl font-bold text-purple-400">{period.activities.length}</div>
                            <div className={`text-sm ${currentTheme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>{t('statistics.activities')}</div>
                        </div>
                    </div>
                </div>
                <div>
                    <h4 className={`text-lg font-semibold mb-4 ${currentTheme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                        {t('statistics.periodActivities')}
                    </h4>
                    <div className="space-y-3">
                        {[...period.activities].sort((a, b) => a.date.localeCompare(b.date)).map((act, index) => (
                            <div key={index} className={`flex items-center justify-between p-3 rounded-lg ${currentTheme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'}`}>
                                <div className="flex items-center gap-4">
                                    <div className={`text-sm w-20 ${currentTheme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>{act.date}</div>
                                    <div className={`font-medium ${currentTheme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{act.option}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-green-400 font-bold">
                                        {act.points} {isSimple ? t('statistics.time') : t('statistics.pts')}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StatisticsPanel; 