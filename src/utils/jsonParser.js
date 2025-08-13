// Utilidad robusta para parsing de JSON de respuestas de IA
// Maneja casos edge, JSON malformado y extracción inteligente

/**
 * Parsea respuestas de IA de forma robusta, manejando múltiples formatos y errores
 * @param {string} content - Contenido crudo de la respuesta de IA
 * @param {string} expectedType - Tipo esperado: 'object' o 'array'
 * @returns {Object} Resultado del parsing con datos y metadatos
 */
export const parseAIResponse = (content, expectedType = 'object') => {
    const result = {
        success: false,
        data: null,
        error: null,
        method: null,
        originalContent: content
    };

    try {
        console.log('🔍 Iniciando parsing robusto de respuesta IA...');
        console.log('📝 Contenido original:', content?.substring(0, 200) + '...');

        if (!content || typeof content !== 'string') {
            throw new Error('Contenido vacío o no es string');
        }

        // Método 1: Limpieza básica y parsing directo
        try {
            const cleaned = basicCleanup(content);
            const parsed = JSON.parse(cleaned);
            result.success = true;
            result.data = parsed;
            result.method = 'basic_cleanup';
            console.log('✅ Éxito con limpieza básica');
            return result;
        } catch (error) {
            console.log('❌ Falló limpieza básica:', error.message);
        }

        // Método 2: Extracción de JSON desde texto
        try {
            const extracted = extractJSONFromText(content, expectedType);
            if (extracted) {
                const parsed = JSON.parse(extracted);
                result.success = true;
                result.data = parsed;
                result.method = 'json_extraction';
                console.log('✅ Éxito con extracción de JSON');
                return result;
            }
        } catch (error) {
            console.log('❌ Falló extracción de JSON:', error.message);
        }

        // Método 3: Reparación agresiva de JSON
        try {
            const repaired = aggressiveJSONRepair(content);
            const parsed = JSON.parse(repaired);
            result.success = true;
            result.data = parsed;
            result.method = 'aggressive_repair';
            console.log('✅ Éxito con reparación agresiva');
            return result;
        } catch (error) {
            console.log('❌ Falló reparación agresiva:', error.message);
        }

        // Método 4: Parsing línea por línea para arrays
        if (expectedType === 'array') {
            try {
                const lineByLine = parseArrayLineByLine(content);
                if (lineByLine && lineByLine.length > 0) {
                    result.success = true;
                    result.data = lineByLine;
                    result.method = 'line_by_line';
                    console.log('✅ Éxito con parsing línea por línea');
                    return result;
                }
            } catch (error) {
                console.log('❌ Falló parsing línea por línea:', error.message);
            }
        }

        // Método 5: Fallback con datos vacíos pero válidos
        const fallbackData = expectedType === 'array' ? [] : {};
        result.success = true;
        result.data = fallbackData;
        result.method = 'fallback_empty';
        result.error = 'No se pudo parsear, usando datos vacíos';
        console.log('⚠️ Usando fallback con datos vacíos');
        return result;

    } catch (error) {
        result.success = false;
        result.error = `Error crítico en parsing: ${error.message}`;
        result.data = expectedType === 'array' ? [] : {};
        console.error('💥 Error crítico en parsing:', error);
        return result;
    }
};

/**
 * Limpieza básica de contenido antes del parsing
 */
const basicCleanup = (content) => {
    let cleaned = content.trim();

    // Remover bloques de código markdown
    cleaned = cleaned.replace(/```json\s*/gi, '').replace(/```\s*$/g, '');
    cleaned = cleaned.replace(/```\s*/g, '');

    // Remover texto explicativo común antes del JSON
    const commonPrefixes = [
        /^.*?(?=\{)/s,  // Todo antes del primer {
        /^.*?(?=\[)/s,  // Todo antes del primer [
        /^[^{\[]*(?=\{|\[)/s,  // Texto antes de { o [
    ];

    for (const prefix of commonPrefixes) {
        const match = cleaned.match(prefix);
        if (match && match[0].length < cleaned.length / 2) {
            cleaned = cleaned.replace(prefix, '');
            break;
        }
    }

    // Remover texto después del JSON
    const jsonEnd = Math.max(
        cleaned.lastIndexOf('}'),
        cleaned.lastIndexOf(']')
    );
    
    if (jsonEnd !== -1 && jsonEnd < cleaned.length - 1) {
        cleaned = cleaned.substring(0, jsonEnd + 1);
    }

    return cleaned.trim();
};

/**
 * Extrae JSON válido desde texto que puede contener otros elementos
 */
const extractJSONFromText = (content, expectedType) => {
    console.log('🔧 Intentando extracción de JSON...');

    // Buscar patrones de JSON
    const patterns = expectedType === 'array' 
        ? [/\[[\s\S]*\]/g, /\[[\s\S]*?\]/g]
        : [/\{[\s\S]*\}/g, /\{[\s\S]*?\}/g];

    for (const pattern of patterns) {
        const matches = content.match(pattern);
        if (matches) {
            // Intentar con cada match, empezando por el más largo
            const sortedMatches = matches.sort((a, b) => b.length - a.length);
            
            for (const match of sortedMatches) {
                try {
                    JSON.parse(match); // Validar que es JSON válido
                    console.log('✅ JSON válido encontrado con pattern matching');
                    return match;
                } catch (e) {
                    continue;
                }
            }
        }
    }

    // Método alternativo: buscar desde caracteres específicos
    const startChar = expectedType === 'array' ? '[' : '{';
    const endChar = expectedType === 'array' ? ']' : '}';
    
    const startIndex = content.indexOf(startChar);
    const endIndex = content.lastIndexOf(endChar);
    
    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
        const extracted = content.substring(startIndex, endIndex + 1);
        try {
            JSON.parse(extracted);
            console.log('✅ JSON válido encontrado con búsqueda por caracteres');
            return extracted;
        } catch (e) {
            console.log('❌ JSON extraído no es válido');
        }
    }

    return null;
};

/**
 * Reparación agresiva de JSON malformado
 */
const aggressiveJSONRepair = (content) => {
    console.log('🔧 Iniciando reparación agresiva...');
    
    let repaired = content.trim();

    // Limpiezas agresivas
    repaired = basicCleanup(repaired);

    // Reparar comillas
    repaired = repaired.replace(/'/g, '"'); // Cambiar comillas simples por dobles
    repaired = repaired.replace(/"/g, '"'); // Normalizar comillas especiales
    repaired = repaired.replace(/"/g, '"');

    // Reparar comas faltantes entre objetos/elementos
    repaired = repaired.replace(/}\s*{/g, '},{');
    repaired = repaired.replace(/]\s*\[/g, '],[');

    // Remover comas finales
    repaired = repaired.replace(/,\s*}/g, '}');
    repaired = repaired.replace(/,\s*]/g, ']');

    // Agregar comillas a propiedades sin comillas
    repaired = repaired.replace(/(\w+):/g, '"$1":');

    // Intentar reparar strings sin comillas de cierre
    repaired = repaired.replace(/:\s*([^",\}\]]+)(?=[,\}\]])/g, ': "$1"');

    // Reparar valores booleanos y números (quitar comillas extras)
    repaired = repaired.replace(/:\s*"(true|false|null|\d+\.?\d*)"(?=[,\}\]])/g, ': $1');

    console.log('🔧 JSON después de reparación:', repaired.substring(0, 200) + '...');
    return repaired;
};

/**
 * Parsing línea por línea para arrays (último recurso)
 */
const parseArrayLineByLine = (content) => {
    console.log('🔧 Intentando parsing línea por línea...');
    
    const lines = content.split('\n');
    const items = [];

    for (const line of lines) {
        const trimmed = line.trim();
        
        // Buscar líneas que parezcan objetos JSON
        if (trimmed.startsWith('{') && trimmed.includes('}')) {
            try {
                const parsed = JSON.parse(trimmed);
                items.push(parsed);
            } catch (e) {
                // Intentar reparar la línea individual
                try {
                    const repaired = aggressiveJSONRepair(trimmed);
                    const parsed = JSON.parse(repaired);
                    items.push(parsed);
                } catch (e2) {
                    console.log('❌ No se pudo parsear línea:', trimmed);
                }
            }
        }
    }

    return items.length > 0 ? items : null;
};

/**
 * Validador específico para transacciones
 */
export const parseTransactionsResponse = (content) => {
    console.log('💳 Parseando respuesta de transacciones...');
    
    const result = parseAIResponse(content, 'array');
    
    if (!result.success) {
        console.warn('⚠️ No se pudieron parsear transacciones, usando array vacío');
        return [];
    }

    // Validar y limpiar transacciones
    const transactions = Array.isArray(result.data) ? result.data : [];
    const validTransactions = [];

    for (const transaction of transactions) {
        if (typeof transaction === 'object' && transaction !== null) {
            // Validar campos mínimos requeridos
            const validTransaction = {
                date: transaction.date || '',
                description: transaction.description || '',
                amount: parseFloat(transaction.amount) || 0,
                type: transaction.type || 'cargo',
                category: transaction.category || null,
                group: transaction.group || null // Campo para identificar el grupo de la transacción
            };

            // Solo agregar si tiene datos mínimos válidos
            if (validTransaction.description && validTransaction.amount !== 0) {
                validTransactions.push(validTransaction);
            }
        }
    }

    console.log(`✅ ${validTransactions.length} transacciones válidas parseadas (método: ${result.method})`);
    
    // Detectar y asignar grupos si no están definidos
    const transactionsWithGroups = assignTransactionGroups(validTransactions);
    
    return transactionsWithGroups;
};

/**
 * Asigna grupos a transacciones basándose en patrones comunes en estados de cuenta
 * @param {Array} transactions - Array de transacciones
 * @returns {Array} Array de transacciones con grupos asignados
 */
const assignTransactionGroups = (transactions) => {
    console.log('🔍 [DEBUG] Asignando grupos a transacciones:', transactions.length);
    
    return transactions.map((transaction, index) => {
        // Si ya tiene grupo definido, mantenerlo
        if (transaction.group) {
            console.log(`✅ Transacción ${index + 1} ya tiene grupo: ${transaction.group}`);
            return transaction;
        }
        
        const description = (transaction.description || '').toLowerCase();
        const amount = parseFloat(transaction.amount) || 0;
        
        console.log(`🔍 [DEBUG] Analizando transacción ${index + 1}:`, {
            description: transaction.description,
            amount: transaction.amount,
            parsedAmount: amount
        });
        
        // Detectar grupos comunes en estados de cuenta
        let detectedGroup = 'general';
        
        // PRIORIDAD 1: Pagos y abonos (generalmente al inicio del estado)
        if (description.includes('pago') || description.includes('abono') || 
            description.includes('payment') || description.includes('transferencia') ||
            description.includes('depósito') || description.includes('deposito') ||
            description.includes('deposit') || description.includes('crédito') ||
            description.includes('credito') || description.includes('credit') ||
            description.includes('reembolso') || description.includes('refund') ||
            amount < 0) {
            detectedGroup = 'pagos';
            console.log(`💳 [DEBUG] Transacción ${index + 1} asignada a grupo 'pagos' por:`, {
                description: description,
                amount: amount,
                reason: amount < 0 ? 'monto negativo' : 'patrón de descripción'
            });
        } 
        // PRIORIDAD 2: Comisiones y cargos financieros
        else if (description.includes('comisión') || description.includes('comision') || 
                 description.includes('fee') || description.includes('cargo por') ||
                 description.includes('cargo financiero') || description.includes('financial charge') ||
                 description.includes('cargo por uso') || description.includes('usage charge') ||
                 description.includes('cargo por retiro') || description.includes('cash advance fee')) {
            detectedGroup = 'comisiones';
            console.log(`💰 [DEBUG] Transacción ${index + 1} asignada a grupo 'comisiones'`);
        } 
        // PRIORIDAD 3: Intereses
        else if (description.includes('interés') || description.includes('interes') || 
                 description.includes('interest') || description.includes('financiamiento') ||
                 description.includes('financing') || description.includes('cargo por financiamiento')) {
            detectedGroup = 'intereses';
            console.log(`📈 [DEBUG] Transacción ${index + 1} asignada a grupo 'intereses'`);
        } 
        // PRIORIDAD 4: Tarjetas adicionales
        else if (description.includes('tarjeta adicional') || description.includes('additional card') ||
                 description.includes('titular') || description.includes('cardholder') ||
                 description.includes('tarjeta suplementaria') || description.includes('supplementary card') ||
                 description.includes('cargo por tarjeta adicional')) {
            detectedGroup = 'tarjeta_adicional';
            console.log(`🔄 [DEBUG] Transacción ${index + 1} asignada a grupo 'tarjeta_adicional'`);
        } 
        // PRIORIDAD 5: Compras y cargos (por defecto)
        else if (description.includes('compra') || description.includes('cargo') || 
                 description.includes('purchase') || description.includes('débito') ||
                 description.includes('debito') || description.includes('debit') ||
                 description.includes('transacción') || description.includes('transaction') ||
                 amount > 0) {
            detectedGroup = 'compras';
            console.log(`🛒 [DEBUG] Transacción ${index + 1} asignada a grupo 'compras' por:`, {
                description: description,
                amount: amount,
                reason: amount > 0 ? 'monto positivo' : 'patrón de descripción'
            });
        } else {
            console.log(`⚠️ [DEBUG] Transacción ${index + 1} asignada a grupo 'general' (sin patrón detectado):`, {
                description: description,
                amount: amount
            });
        }
        
        return {
            ...transaction,
            group: detectedGroup
        };
    });
};

/**
 * Validador específico para análisis de estado de cuenta
 */
export const parseStatementResponse = (content) => {
    console.log('📄 Parseando respuesta de estado de cuenta...');
    
    const result = parseAIResponse(content, 'object');
    
    if (!result.success) {
        console.warn('⚠️ No se pudo parsear estado, usando objeto vacío');
        return {};
    }

    // Validar y limpiar datos del statement
    const data = result.data || {};
    
    console.log('🔍 [DEBUG] Datos crudos del parser:', {
        totalBalance: data.totalBalance,
        previousBalance: data.previousBalance,
        minimumPayment: data.minimumPayment,
        typeof_totalBalance: typeof data.totalBalance,
        typeof_previousBalance: typeof data.previousBalance,
        typeof_minimumPayment: typeof data.minimumPayment
    });
    
    const statement = {
        // Campos numéricos con validación - permitir 0 como valor válido
        totalBalance: data.totalBalance !== undefined && data.totalBalance !== null ? parseFloat(data.totalBalance) : null,
        previousBalance: data.previousBalance !== undefined && data.previousBalance !== null ? parseFloat(data.previousBalance) : null,
        creditLimit: data.creditLimit !== undefined && data.creditLimit !== null ? parseFloat(data.creditLimit) : null,
        minimumPayment: data.minimumPayment !== undefined && data.minimumPayment !== null ? parseFloat(data.minimumPayment) : null,
        availableCredit: data.availableCredit !== undefined && data.availableCredit !== null ? parseFloat(data.availableCredit) : null,
        payments: data.payments !== undefined && data.payments !== null ? parseFloat(data.payments) : null,
        charges: data.charges !== undefined && data.charges !== null ? parseFloat(data.charges) : null,
        fees: data.fees !== undefined && data.fees !== null ? parseFloat(data.fees) : null,
        interest: data.interest !== undefined && data.interest !== null ? parseFloat(data.interest) : null,
        
        // Campos de texto
        bankName: data.bankName || '',
        cardHolderName: data.cardHolderName || '',
        lastFourDigits: data.lastFourDigits || '',
        statementDate: data.statementDate || '',
        dueDate: data.dueDate || '',
        
        // Transacciones (array)
        transactions: Array.isArray(data.transactions) ? data.transactions : []
    };

    console.log(`✅ Statement parseado exitosamente (método: ${result.method})`);
    console.log('🔍 [DEBUG] Statement final procesado:', {
        totalBalance: statement.totalBalance,
        previousBalance: statement.previousBalance,
        minimumPayment: statement.minimumPayment,
        transactionsCount: statement.transactions?.length || 0
    });
    return statement;
};

/**
 * Helper para logging detallado de errores de parsing
 */
export const logParsingError = (error, content, context = '') => {
    console.group(`💥 Error de Parsing JSON${context ? ` - ${context}` : ''}`);
    console.error('Error:', error.message);
    console.log('Contenido problemático (primeros 300 chars):', content?.substring(0, 300));
    console.log('Ubicación del error:', error.message.match(/position (\d+)/)?.[1] || 'No especificada');
    
    // Intentar mostrar el carácter problemático
    const positionMatch = error.message.match(/position (\d+)/);
    if (positionMatch && content) {
        const position = parseInt(positionMatch[1]);
        const start = Math.max(0, position - 20);
        const end = Math.min(content.length, position + 20);
        const snippet = content.substring(start, end);
        const pointer = ' '.repeat(Math.min(20, position - start)) + '^';
        
        console.log('Contexto del error:');
        console.log(snippet);
        console.log(pointer);
    }
    
    console.groupEnd();
};
