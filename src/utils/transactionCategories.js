// Sistema de categorización de transacciones
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { findUserCategoryPattern } from './userCategoryPatterns';

// Configurar IA
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
const openai = new OpenAI({
    apiKey: import.meta.env.VITE_OPENAI_API_KEY,
    dangerouslyAllowBrowser: true
});

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
    const categorizedTransactions = [];
    
    for (const transaction of transactions) {
        const result = await categorizeTransaction(transaction, userPatterns);
        
        categorizedTransactions.push({
            ...transaction,
            category: result.category,
            categoryConfidence: result.confidence,
            categoryMethod: result.method,
            categoryPatternId: result.patternId || null,
            categoryData: TRANSACTION_CATEGORIES[result.category]
        });
        
        // Pausa configurable para respetar límites de cuota
        if (result.method === 'ai') {
            // Usar delay configurado por el usuario o valor por defecto
            const delay = userSettings?.autoCategorizationDelay || 2000;
            console.log(`Esperando ${delay}ms antes de la siguiente categorización...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
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

export default {
    TRANSACTION_CATEGORIES,
    categorizeTransaction,
    categorizeTransactions,
    getCategoryStats,
    categorizeByPatterns,
    categorizeWithAI
};
