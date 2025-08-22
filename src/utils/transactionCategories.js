// Sistema de categorización de transacciones
// 
// FUNCIONES OPTIMIZADAS PARA AHORRAR TOKENS:
// 
// 1. categorizePendingMerchants() - RECOMENDADA para categorización eficiente
//    - Categoriza SOLO los comercios que no tienen patrones aplicados
//    - Hace UNA SOLA petición a la IA con toda la lista
//    - Ahorra tokens y reduce peticiones
//    - Uso: await categorizePendingMerchants(transactions, userPatterns, userSettings)
//
// 2. categorizeMultipleTransactionsWithAI() - Para categorización masiva
//    - Categoriza múltiples transacciones en una sola petición
//    - Útil cuando ya sabes qué transacciones necesitan categorización
//    - Uso: await categorizeMultipleTransactionsWithAI(transactions, useOpenAI)
//
// 3. categorizeTransactions() - Función principal (ya optimizada)
//    - Usa automáticamente categorización masiva cuando es posible
//    - Fallback a categorización individual si es necesario
//    - Uso: await categorizeTransactions(transactions, userPatterns, userSettings)
//
// BENEFICIOS DE LA OPTIMIZACIÓN:
// - Reduce peticiones a la IA de N a 1 (donde N = número de transacciones)
// - Ahorra tokens al enviar todo en un solo prompt
// - Mantiene la calidad de categorización
// - Fallback automático si hay errores

import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { findUserCategoryPattern } from './userCategoryPatterns';

// Configurar IA
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
const openai = new OpenAI({
    apiKey: import.meta.env.VITE_OPENAI_API_KEY,
    dangerouslyAllowBrowser: true
});

// Tipos de transacciones disponibles
export const TRANSACTION_TYPES = {
    cargo: 'Cargo',
    pago: 'Pago',
    interes: 'Interés',
    comision: 'Comisión',
    saldo_anterior: 'Saldo Anterior',
    interes_a_favor: 'Interés a Favor', // Nuevo tipo para intereses sobre saldos a favor
    ajuste: 'Ajuste'
};

// Categorías disponibles con íconos y colores
export const TRANSACTION_CATEGORIES = {
    food: {
        name: 'Alimentación',
        icon: '🍔',
        color: '#EF4444',
        keywords: ['restaurante', 'comida', 'pizza', 'mcdonald', 'burger', 'kfc', 'subway', 'domino', 'starbucks', 'cafe', 'bar', 'cerveza', 'supermercado', 'mercado', 'grocery', 'walmart', 'soriana', 'oxxo', 'seven', '7-eleven']
    },
    transport: {
        name: 'Transporte',
        icon: '🚗',
        color: '#3B82F6',
        keywords: ['uber', 'taxi', 'gasolina', 'pemex', 'shell', 'bp', 'mobil', 'gas', 'combustible', 'autobus', 'metro', 'tren', 'parking', 'estacionamiento', 'autopista', 'peaje', 'toll']
    },
    shopping: {
        name: 'Compras',
        icon: '🛍️',
        color: '#8B5CF6',
        keywords: ['amazon', 'mercadolibre', 'liverpool', 'palacio', 'sears', 'coppel', 'elektra', 'best buy', 'office depot', 'costco', 'sams', 'tienda', 'plaza', 'mall', 'centro comercial']
    },
    entertainment: {
        name: 'Entretenimiento',
        icon: '🎬',
        color: '#F59E0B',
        keywords: ['netflix', 'spotify', 'disney', 'hbo', 'prime video', 'youtube', 'cinema', 'cine', 'teatro', 'concierto', 'bar', 'club', 'discoteca', 'juego', 'game', 'xbox', 'playstation', 'steam']
    },
    health: {
        name: 'Salud',
        icon: '⚕️',
        color: '#10B981',
        keywords: ['farmacia', 'doctor', 'medico', 'hospital', 'clinica', 'laboratorio', 'dental', 'dentista', 'optica', 'guadalajara', 'benavides', 'similares', 'del ahorro', 'pharmacy']
    },
    services: {
        name: 'Servicios',
        icon: '🔧',
        color: '#6B7280',
        keywords: ['banco', 'comision', 'fee', 'transferencia', 'cajero', 'atm', 'mantenimiento', 'reparacion', 'servicio', 'taller', 'mecanico', 'plomero', 'electricista', 'limpieza']
    },
    bills: {
        name: 'Servicios Básicos',
        icon: '📄',
        color: '#DC2626',
        keywords: ['cfe', 'luz', 'agua', 'gas', 'telefono', 'internet', 'telmex', 'telcel', 'movistar', 'at&t', 'totalplay', 'megacable', 'dish', 'sky', 'netflix', 'spotify']
    },
    education: {
        name: 'Educación',
        icon: '📚',
        color: '#7C3AED',
        keywords: ['escuela', 'universidad', 'colegio', 'curso', 'libro', 'libreria', 'material escolar', 'educacion', 'tuition', 'udemy', 'coursera', 'platzi']
    },
    travel: {
        name: 'Viajes',
        icon: '✈️',
        color: '#0EA5E9',
        keywords: ['hotel', 'airbnb', 'booking', 'expedia', 'volaris', 'aeromexico', 'interjet', 'viva aerobus', 'despegar', 'vuelo', 'flight', 'avion', 'renta', 'rental', 'hertz', 'avis']
    },
    investment: {
        name: 'Inversiones',
        icon: '📈',
        color: '#059669',
        keywords: ['inversion', 'broker', 'gbm', 'kuspit', 'biva', 'bolsa', 'acciones', 'cetes', 'bonds', 'etf', 'crypto', 'bitcoin', 'binance', 'bitso']
    },
    other: {
        name: 'Otros',
        icon: '❓',
        color: '#9CA3AF',
        keywords: []
    }
};

// Base de datos de patrones específicos de comercios en México
const MERCHANT_PATTERNS = {
    // Alimentación
    'OXXO': 'food',
    'SEVEN ELEVEN': 'food',
    'WALMART': 'food',
    'SORIANA': 'food',
    'CHEDRAUI': 'food',
    'AURRERA': 'food',
    'MCDONALD': 'food',
    'BURGER KING': 'food',
    'KFC': 'food',
    'SUBWAY': 'food',
    'DOMINOS': 'food',
    'PIZZA HUT': 'food',
    'STARBUCKS': 'food',
    
    // Transporte
    'PEMEX': 'transport',
    'SHELL': 'transport',
    'BP': 'transport',
    'MOBIL': 'transport',
    'UBER': 'transport',
    'DIDI': 'transport',
    
    // Compras
    'AMAZON': 'shopping',
    'MERCADOLIBRE': 'shopping',
    'LIVERPOOL': 'shopping',
    'PALACIO DE HIERRO': 'shopping',
    'SEARS': 'shopping',
    'COPPEL': 'shopping',
    'ELEKTRA': 'shopping',
    'BEST BUY': 'shopping',
    'COSTCO': 'shopping',
    'SAMS CLUB': 'shopping',
    
    // Entretenimiento
    'NETFLIX': 'entertainment',
    'SPOTIFY': 'entertainment',
    'DISNEY': 'entertainment',
    'HBO': 'entertainment',
    'AMAZON PRIME': 'entertainment',
    'YOUTUBE': 'entertainment',
    'CINEPOLIS': 'entertainment',
    'CINEMEX': 'entertainment',
    
    // Salud
    'FARMACIA GUADALAJARA': 'health',
    'FARMACIAS BENAVIDES': 'health',
    'FARMACIAS SIMILARES': 'health',
    'FARMACIA DEL AHORRO': 'health',
    'HOSPITAL': 'health',
    'CLINICA': 'health',
    
    // Servicios básicos
    'CFE': 'bills',
    'TELMEX': 'bills',
    'TELCEL': 'bills',
    'MOVISTAR': 'bills',
    'AT&T': 'bills',
    'TOTALPLAY': 'bills',
    'MEGACABLE': 'bills',
    'DISH': 'bills',
    'SKY': 'bills'
};

// Función para categorizar usando patrones (rápido)
export const categorizeByPatterns = (description) => {
    const cleanDescription = description.toUpperCase().trim();
    
    // Buscar coincidencia exacta de comercio
    for (const [merchant, category] of Object.entries(MERCHANT_PATTERNS)) {
        if (cleanDescription.includes(merchant)) {
            return category;
        }
    }
    
    // Buscar por palabras clave
    for (const [categoryKey, categoryData] of Object.entries(TRANSACTION_CATEGORIES)) {
        for (const keyword of categoryData.keywords) {
            if (cleanDescription.includes(keyword.toUpperCase())) {
                return categoryKey;
            }
        }
    }
    
    return null; // No encontrado
};

// Función para categorizar usando IA (para casos complejos)
export const categorizeWithAI = async (transaction, useOpenAI = false) => {
    try {
        const categoryList = Object.entries(TRANSACTION_CATEGORIES)
            .map(([key, data]) => `${key}: ${data.name}`)
            .join(', ');

        const prompt = `Analiza esta transacción bancaria y categorízala:

Descripción: "${transaction.description}"
Monto: $${Math.abs(transaction.amount)}
Tipo: ${transaction.type}

Categorías disponibles: ${categoryList}

Instrucciones:
- Responde SOLO con la clave de categoría (ej: "food", "transport", etc.)
- Si no estás seguro, usa "other"
- Considera el contexto mexicano/latinoamericano
- Para montos pequeños en comercios como OXXO, considera "food"

Categoría:`;

        let response;
        
        if (useOpenAI && import.meta.env.VITE_OPENAI_API_KEY) {
            response = await openai.chat.completions.create({
                model: "gpt-4o-mini", // Modelo más barato para categorización
                messages: [{ role: "user", content: prompt }],
                max_tokens: 10,
                temperature: 0.1
            });
            
            const category = response.choices[0].message.content.trim().toLowerCase();
            return TRANSACTION_CATEGORIES[category] ? category : 'other';
            
        } else if (import.meta.env.VITE_GEMINI_API_KEY) {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const result = await model.generateContent(prompt);
            const category = result.response.text().trim().toLowerCase();
            
            return TRANSACTION_CATEGORIES[category] ? category : 'other';
        }
        
        return 'other';
        
    } catch (error) {
        console.error('Error al categorizar con IA:', error);
        
        // Manejo específico de errores de cuota
        if (error.message && error.message.includes('429')) {
            console.warn('⚠️ Límite de cuota de IA alcanzado - usando categoría "other"');
        } else if (error.message && error.message.includes('quota')) {
            console.warn('⚠️ Cuota de IA excedida - usando categoría "other"');
        }
        
        return 'other';
    }
};

// Función principal de categorización (híbrida)
export const categorizeTransaction = async (transaction, userPatterns = null) => {
    console.log('Categorizando transacción:', transaction.description);
    
    // Paso 1: Verificar patrones personalizados del usuario (prioridad máxima)
    if (userPatterns) {
        const userPattern = findUserCategoryPattern(userPatterns, transaction.description);
        if (userPattern) {
            console.log('Categorizada por patrón del usuario:', userPattern.category);
            return {
                category: userPattern.category,
                confidence: 'user',
                method: 'user_pattern',
                patternId: userPattern.id
            };
        }
    }
    
    // Paso 2: Intentar con patrones generales (rápido)
    let category = categorizeByPatterns(transaction.description);
    
    if (category) {
        console.log('Categorizada por patrón general:', category);
        return {
            category,
            confidence: 'high',
            method: 'pattern'
        };
    }
    
    // Paso 3: Usar IA para casos complejos
    console.log('Categorizando con IA...');
    category = await categorizeWithAI(transaction);
    
    return {
        category,
        confidence: 'medium',
        method: 'ai'
    };
};

// Función para categorizar múltiples transacciones
export const categorizeTransactions = async (transactions, userPatterns = null, userSettings = null) => {
    console.log(`🚀 Iniciando categorización de ${transactions.length} transacciones...`);
    
    // Paso 1: Aplicar patrones del usuario (prioridad máxima)
    let categorizedTransactions = transactions.map(transaction => {
        if (userPatterns) {
            const userPattern = findUserCategoryPattern(userPatterns, transaction.description);
            if (userPattern) {
                console.log(`✅ Categorizada por patrón del usuario: "${transaction.description}" → ${userPattern.category}`);
                return {
                    ...transaction,
                    category: userPattern.category,
                    categoryConfidence: 'user',
                    categoryMethod: 'user_pattern',
                    categoryPatternId: userPattern.id,
                    categoryData: TRANSACTION_CATEGORIES[userPattern.category]
                };
            }
        }
        return transaction;
    });
    
    // Paso 2: Aplicar patrones generales (rápido)
    categorizedTransactions = categorizedTransactions.map(transaction => {
        if (!transaction.category) {
            const category = categorizeByPatterns(transaction.description);
            if (category) {
                console.log(`✅ Categorizada por patrón general: "${transaction.description}" → ${category}`);
                return {
                    ...transaction,
                    category,
                    categoryConfidence: 'high',
                    categoryMethod: 'pattern',
                    categoryData: TRANSACTION_CATEGORIES[category]
                };
            }
        }
        return transaction;
    });
    
    // Paso 3: Identificar transacciones pendientes de categorización
    const uncategorizedTransactions = categorizedTransactions.filter(t => !t.category);
    
    if (uncategorizedTransactions.length === 0) {
        console.log('✅ Todas las transacciones categorizadas por patrones');
        return categorizedTransactions;
    }
    
    console.log(`📊 Transacciones pendientes de categorización: ${uncategorizedTransactions.length}`);
    
    // Paso 4: Usar categorización masiva con IA (optimizada)
    if (uncategorizedTransactions.length > 1) {
        console.log('🚀 Usando categorización masiva con IA para optimizar tokens...');
        
        try {
            const useOpenAI = userSettings?.preferOpenAI || false;
            const bulkCategorized = await categorizeMultipleTransactionsWithAI(
                categorizedTransactions, 
                useOpenAI
            );
            
            console.log(`✅ Categorización masiva completada: ${uncategorizedTransactions.length} transacciones procesadas`);
            return bulkCategorized;
            
        } catch (error) {
            console.warn('⚠️ Error en categorización masiva, fallando a método individual:', error);
            // Continuar con método individual como fallback
        }
    }
    
    // Paso 5: Fallback a categorización individual (solo si es necesario)
    console.log('🔄 Aplicando categorización individual como fallback...');
    
    for (const transaction of uncategorizedTransactions) {
        if (!transaction.category) {
            const result = await categorizeTransaction(transaction, userPatterns);
            
            const transactionIndex = categorizedTransactions.findIndex(t => 
                t.description === transaction.description && 
                t.amount === transaction.amount
            );
            
            if (transactionIndex !== -1) {
                categorizedTransactions[transactionIndex] = {
                    ...categorizedTransactions[transactionIndex],
                    category: result.category,
                    categoryConfidence: result.confidence,
                    categoryMethod: result.method,
                    categoryPatternId: result.patternId || null,
                    categoryData: TRANSACTION_CATEGORIES[result.category]
                };
            }
            
            // Pausa configurable para respetar límites de cuota
            if (result.method === 'ai') {
                const delay = userSettings?.autoCategorizationDelay || 2000;
                console.log(`Esperando ${delay}ms antes de la siguiente categorización...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    // Asegurar que todas las transacciones tengan categoría
    categorizedTransactions = categorizedTransactions.map(transaction => {
        if (!transaction.category) {
            return {
                ...transaction,
                category: 'other',
                categoryConfidence: 'low',
                categoryMethod: 'fallback',
                categoryData: TRANSACTION_CATEGORIES.other
            };
        }
        return transaction;
    });
    
    console.log(`✅ Categorización completada: ${categorizedTransactions.length} transacciones procesadas`);
    return categorizedTransactions;
};

// Función para obtener estadísticas por categoría
export const getCategoryStats = (transactions) => {
    const stats = {};
    let totalAmount = 0;
    
    // Inicializar estadísticas
    Object.keys(TRANSACTION_CATEGORIES).forEach(category => {
        stats[category] = {
            ...TRANSACTION_CATEGORIES[category],
            count: 0,
            amount: 0,
            percentage: 0,
            transactions: []
        };
    });
    
    // Procesar transacciones
    transactions.forEach(transaction => {
        const category = transaction.category || 'other';
        const amount = Math.abs(transaction.amount || 0);
        
        if (stats[category]) {
            stats[category].count++;
            stats[category].amount += amount;
            stats[category].transactions.push(transaction);
            totalAmount += amount;
        }
    });
    
    // Calcular porcentajes
    Object.values(stats).forEach(categoryStats => {
        categoryStats.percentage = totalAmount > 0 
            ? (categoryStats.amount / totalAmount) * 100 
            : 0;
    });
    
    return {
        categories: stats,
        totalAmount,
        totalTransactions: transactions.length
    };
};

// Función para categorizar múltiples transacciones en una sola petición a la IA
export const categorizeMultipleTransactionsWithAI = async (transactions, useOpenAI = false) => {
    try {
        // Filtrar solo transacciones que no tienen categoría o que no fueron categorizadas por patrones
        const uncategorizedTransactions = transactions.filter(t => !t.category || t.category === 'other');
        
        if (uncategorizedTransactions.length === 0) {
            console.log('✅ Todas las transacciones ya están categorizadas');
            return transactions;
        }

        console.log(`🚀 Categorizando ${uncategorizedTransactions.length} transacciones en una sola petición a la IA...`);

        const categoryList = Object.entries(TRANSACTION_CATEGORIES)
            .map(([key, data]) => `${key}: ${data.name}`)
            .join(', ');

        // Crear lista de comercios para categorizar
        const merchantsList = uncategorizedTransactions.map(t => ({
            description: t.description,
            amount: Math.abs(t.amount || 0),
            type: t.type || 'cargo'
        }));

        const prompt = `Categoriza los siguientes comercios/transacciones bancarias en una sola respuesta:

LISTA DE COMERCIOS A CATEGORIZAR:
${merchantsList.map((t, index) => `${index + 1}. "${t.description}" - $${t.amount} (${t.type})`).join('\n')}

CATEGORÍAS DISPONIBLES:
${categoryList}

INSTRUCCIONES:
- Responde SOLO con un JSON array donde cada elemento tenga: {"index": número, "category": "clave_categoría"}
- El "index" debe corresponder al número de la lista (1, 2, 3, etc.)
- Usa las claves exactas de categoría (food, transport, shopping, etc.)
- Si no estás seguro de alguna, usa "other"
- Considera el contexto mexicano/latinoamericano
- Para montos pequeños en comercios como OXXO, considera "food"
- Para servicios bancarios, considera "services"

RESPUESTA (solo JSON):`;

        let response;
        
        if (useOpenAI && import.meta.env.VITE_OPENAI_API_KEY) {
            response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 500, // Aumentar tokens para múltiples categorías
                temperature: 0.1
            });
            
            const responseText = response.choices[0].message.content.trim();
            return parseBulkCategorizationResponse(responseText, uncategorizedTransactions, transactions);
            
        } else if (import.meta.env.VITE_GEMINI_API_KEY) {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const result = await model.generateContent(prompt);
            const responseText = result.response.text().trim();
            
            return parseBulkCategorizationResponse(responseText, uncategorizedTransactions, transactions);
        }
        
        // Si no hay IA disponible, marcar como "other"
        console.warn('⚠️ No hay IA disponible - marcando transacciones como "other"');
        return markTransactionsAsOther(transactions);
        
    } catch (error) {
        console.error('Error al categorizar múltiples transacciones con IA:', error);
        
        // Manejo específico de errores de cuota
        if (error.message && error.message.includes('429')) {
            console.warn('⚠️ Límite de cuota de IA alcanzado - usando categoría "other"');
        } else if (error.message && error.message.includes('quota')) {
            console.warn('⚠️ Cuota de IA excedida - usando categoría "other"');
        }
        
        return markTransactionsAsOther(transactions);
    }
};

// Función específica para categorizar solo comercios pendientes (optimizada para tokens)
export const categorizePendingMerchants = async (transactions, userPatterns = null, userSettings = null) => {
    console.log(`🔍 Identificando comercios pendientes de categorización...`);
    
    // Filtrar transacciones que no tienen categoría o que no fueron categorizadas por patrones
    const pendingTransactions = transactions.filter(t => {
        // Si ya tiene categoría y no es "other", no necesita categorización
        if (t.category && t.category !== 'other') {
            return false;
        }
        
        // Si tiene patrones del usuario, no necesita categorización
        if (userPatterns && findUserCategoryPattern(userPatterns, t.description)) {
            return false;
        }
        
        // Si tiene patrones generales, no necesita categorización
        if (categorizeByPatterns(t.description)) {
            return false;
        }
        
        return true;
    });
    
    if (pendingTransactions.length === 0) {
        console.log('✅ No hay comercios pendientes de categorización');
        return transactions;
    }
    
    console.log(`📋 Comercios pendientes de categorización: ${pendingTransactions.length}`);
    
    // Crear lista de comercios para categorizar
    const merchantsList = pendingTransactions.map(t => ({
        description: t.description,
        amount: Math.abs(t.amount || 0),
        type: t.type || 'cargo'
    }));
    
    console.log('📝 Lista de comercios a categorizar:');
    merchantsList.forEach((merchant, index) => {
        console.log(`  ${index + 1}. "${merchant.description}" - $${merchant.amount} (${merchant.type})`);
    });
    
    // Usar categorización masiva para optimizar tokens
    try {
        const useOpenAI = userSettings?.preferOpenAI || false;
        const categorizedTransactions = await categorizeMultipleTransactionsWithAI(
            transactions, 
            useOpenAI
        );
        
        console.log(`✅ Categorización de comercios pendientes completada`);
        return categorizedTransactions;
        
    } catch (error) {
        console.error('Error en categorización de comercios pendientes:', error);
        
        // Fallback: marcar como "other"
        return transactions.map(transaction => {
            if (pendingTransactions.some(p => p.description === transaction.description)) {
                return {
                    ...transaction,
                    category: 'other',
                    categoryConfidence: 'low',
                    categoryMethod: 'fallback',
                    categoryData: TRANSACTION_CATEGORIES.other
                };
            }
            return transaction;
        });
    }
};

// Función auxiliar para parsear la respuesta de categorización masiva
const parseBulkCategorizationResponse = (responseText, uncategorizedTransactions, allTransactions) => {
    try {
        // Intentar extraer JSON de la respuesta
        let jsonMatch = responseText.match(/\[.*\]/s);
        if (!jsonMatch) {
            // Si no hay JSON, buscar líneas con formato "index: category"
            const lines = responseText.split('\n').filter(line => line.includes(':') || line.includes('→'));
            const parsedCategories = {};
            
            lines.forEach(line => {
                const match = line.match(/(\d+)[:\-→]\s*(\w+)/);
                if (match) {
                    const index = parseInt(match[1]) - 1; // Convertir a índice base 0
                    const category = match[2].toLowerCase().trim();
                    if (index >= 0 && index < uncategorizedTransactions.length) {
                        parsedCategories[index] = category;
                    }
                }
            });
            
            if (Object.keys(parsedCategories).length > 0) {
                return applyBulkCategorization(parsedCategories, uncategorizedTransactions, allTransactions);
            }
        } else {
            // Parsear JSON
            const categories = JSON.parse(jsonMatch[0]);
            const parsedCategories = {};
            
            categories.forEach(item => {
                if (item.index && item.category) {
                    const index = parseInt(item.index) - 1; // Convertir a índice base 0
                    if (index >= 0 && index < uncategorizedTransactions.length) {
                        parsedCategories[index] = item.category.toLowerCase().trim();
                    }
                }
            });
            
            if (Object.keys(parsedCategories).length > 0) {
                return applyBulkCategorization(parsedCategories, uncategorizedTransactions, allTransactions);
            }
        }
        
        console.warn('⚠️ No se pudo parsear la respuesta de categorización masiva');
        return markTransactionsAsOther(allTransactions);
        
    } catch (parseError) {
        console.error('Error parseando respuesta de categorización masiva:', parseError);
        return markTransactionsAsOther(allTransactions);
    }
};

// Función auxiliar para aplicar las categorías obtenidas
const applyBulkCategorization = (parsedCategories, uncategorizedTransactions, allTransactions) => {
    const updatedTransactions = [...allTransactions];
    
    Object.entries(parsedCategories).forEach(([indexStr, category]) => {
        const index = parseInt(indexStr);
        const transaction = uncategorizedTransactions[index];
        
        if (transaction && TRANSACTION_CATEGORIES[category]) {
            // Encontrar la transacción en la lista completa y actualizarla
            const transactionIndex = updatedTransactions.findIndex(t => 
                t.description === transaction.description && 
                t.amount === transaction.amount
            );
            
            if (transactionIndex !== -1) {
                updatedTransactions[transactionIndex] = {
                    ...updatedTransactions[transactionIndex],
                    category,
                    categoryConfidence: 'medium',
                    categoryMethod: 'bulk_ai',
                    categoryData: TRANSACTION_CATEGORIES[category]
                };
                
                console.log(`✅ Categorizada: "${transaction.description}" → ${category}`);
            }
        }
    });
    
    // Marcar las no categorizadas como "other"
    updatedTransactions.forEach(transaction => {
        if (!transaction.category) {
            transaction.category = 'other';
            transaction.categoryConfidence = 'low';
            transaction.categoryMethod = 'fallback';
            transaction.categoryData = TRANSACTION_CATEGORIES.other;
        }
    });
    
    return updatedTransactions;
};

// Función auxiliar para marcar transacciones como "other"
const markTransactionsAsOther = (transactions) => {
    return transactions.map(transaction => ({
        ...transaction,
        category: transaction.category || 'other',
        categoryConfidence: transaction.categoryConfidence || 'low',
        categoryMethod: transaction.categoryMethod || 'fallback',
        categoryData: transaction.categoryData || TRANSACTION_CATEGORIES.other
    }));
};

export default {
    TRANSACTION_CATEGORIES,
    TRANSACTION_TYPES,
    categorizeTransaction,
    categorizeTransactions,
    categorizePendingMerchants, // Nueva función optimizada
    categorizeMultipleTransactionsWithAI, // Nueva función para categorización masiva
    getCategoryStats,
    categorizeByPatterns,
    categorizeWithAI
};
