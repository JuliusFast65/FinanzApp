// Utilidad para validar la consistencia de estados de cuenta
// Detecta errores en la extracción de IA comparando movimientos con saldos

/**
 * Valida la consistencia de un estado de cuenta con 3 validaciones específicas
 * @param {Object} statementData - Datos del estado de cuenta
 * @returns {Object} Resultado de la validación con errores y advertencias
 */
export const validateStatement = (statementData) => {
    const validation = {
        isValid: true,
        errors: [],
        warnings: [],
        calculations: {},
        suggestions: []
    };

    try {
        console.log('🔍 Iniciando validación simplificada...');
        
        // Extraer datos principales
        const {
            totalBalance,
            previousBalance,
            minimumPayment,
            dueDate,
            statementDate,
            transactions = []
        } = statementData;

        // Intentar obtener saldo anterior si no está disponible directamente
        let effectivePreviousBalance = previousBalance;
        
        if ((effectivePreviousBalance === undefined || effectivePreviousBalance === null) && transactions.length > 0) {
            console.log('🔍 Saldo anterior no disponible directamente, buscando en transacciones...');
            
            // Buscar en las transacciones indicadores de saldo anterior
            const potentialPreviousBalance = findPreviousBalanceInTransactions(transactions);
            if (potentialPreviousBalance !== null) {
                effectivePreviousBalance = potentialPreviousBalance;
                console.log('✅ Saldo anterior encontrado en transacciones:', effectivePreviousBalance);
            }
        }

        console.log('📊 Saldos para validación:', {
            previousBalance: previousBalance,
            effectivePreviousBalance: effectivePreviousBalance,
            totalBalance: totalBalance,
            source: effectivePreviousBalance === previousBalance ? 'directo' : 'transacciones'
        });

        // Calcular totales desde transacciones
        const calculatedTotals = calculateTotalsFromTransactions(transactions);
        validation.calculations = calculatedTotals;

        // ==================== VALIDACIÓN 1: FÓRMULA DE SALDO ====================
        // Permitir 0 como valor válido - solo rechazar undefined/null
        if (effectivePreviousBalance !== undefined && effectivePreviousBalance !== null && 
            totalBalance !== undefined && totalBalance !== null) {
            
            // Para la fórmula de saldo, preservar signos originales
            // En tarjetas de crédito: positivo = deuda, negativo = saldo a favor
            const parsedPreviousBalance = parseFloat(effectivePreviousBalance) || 0;
            const parsedTotalBalance = parseFloat(totalBalance) || 0;
            
            // IMPORTANTE: Los totales calculados ya están normalizados como valores absolutos
            // pero para la fórmula de saldo necesitamos considerar los signos correctos:
            // - Si el saldo anterior es positivo (+378.64), significa deuda
            // - Si los cargos vienen negativos en el PDF, los convertimos a positivos para la fórmula
            // - Si los pagos vienen positivos en el PDF, los mantenemos positivos para la fórmula
            
            // Fórmula correcta: Saldo Anterior + Cargos - Pagos = Saldo Actual
            // - Saldo anterior: mantener signo original (+ deuda, - saldo a favor)
            // - Cargos: usar valor absoluto (siempre positivo, aumentan deuda)
            // - Pagos: usar valor absoluto (siempre positivo, reducen deuda)
            const expectedBalance = parsedPreviousBalance + calculatedTotals.totalCharges - calculatedTotals.totalPayments;
            const balanceDifference = Math.abs(parsedTotalBalance - expectedBalance);

            console.log('🧮 Validación 1 - Fórmula de saldo:', {
                previousBalance: parsedPreviousBalance,
                totalCharges: calculatedTotals.totalCharges,
                totalPayments: calculatedTotals.totalPayments,
                expectedBalance: expectedBalance,
                actualBalance: parsedTotalBalance,
                difference: balanceDifference,
                formula: `${parsedPreviousBalance} + ${calculatedTotals.totalCharges} - ${calculatedTotals.totalPayments} = ${expectedBalance}`,
                explanation: `Saldo anterior (${parsedPreviousBalance >= 0 ? 'deuda' : 'saldo a favor'}) + Cargos (gastos) - Pagos (abonos) = Saldo esperado`
            });

            // Caso especial: Si todo es 0, está perfecto (tarjeta sin actividad/pagada)
            if (parsedPreviousBalance === 0 && parsedTotalBalance === 0 && 
                calculatedTotals.totalCharges === 0 && calculatedTotals.totalPayments === 0) {
                console.log('✅ Validación 1 OK - Tarjeta sin actividad (0+0-0=0)');
            } else {
                // Tolerancia: hasta $10 o 1% del saldo absoluto
                const tolerance = Math.max(10, Math.abs(parsedTotalBalance) * 0.01);
                
                if (balanceDifference <= tolerance) {
                    console.log('✅ Validación 1 OK - Fórmula de saldo correcta');
                } else {
                    // Agregar información adicional para debugging
                    const debugInfo = {
                        previousBalance: parsedPreviousBalance,
                        totalCharges: calculatedTotals.totalCharges,
                        totalPayments: calculatedTotals.totalPayments,
                        expectedBalance: expectedBalance,
                        actualBalance: parsedTotalBalance,
                        difference: balanceDifference,
                        tolerance: tolerance,
                        transactionCount: calculatedTotals.transactionCount
                    };
                    
                    validation.warnings.push({
                        type: 'balance_formula_mismatch',
                        field: 'totalBalance',
                        message: `Fórmula de saldo no cuadra: Saldo anterior ($${parsedPreviousBalance.toLocaleString()}) + Cargos ($${calculatedTotals.totalCharges.toLocaleString()}) - Pagos ($${calculatedTotals.totalPayments.toLocaleString()}) = $${expectedBalance.toLocaleString()}, pero el saldo reportado es $${parsedTotalBalance.toLocaleString()}`,
                        severity: 'high',
                        expected: expectedBalance,
                        actual: parsedTotalBalance,
                        difference: balanceDifference,
                        tolerance: tolerance,
                        debugInfo: debugInfo
                    });
                    
                    console.log('❌ Validación 1 FALLA - Fórmula de saldo incorrecta');
                    console.log('🔍 Información de debugging:', debugInfo);
                    console.log('💡 Posibles causas:');
                    console.log('   • Transacciones no capturadas correctamente por la IA');
                    console.log('   • Clasificación incorrecta de cargos vs pagos');
                    console.log('   • Montos con signos incorrectos en el PDF original');
                    console.log('   • Comisiones o intereses no incluidos en los cargos');
                }
            }
        } else {
            // Solo reportar error si realmente faltan datos (no si son 0)
            const missingFields = [];
            if (effectivePreviousBalance === undefined || effectivePreviousBalance === null) {
                missingFields.push('saldo anterior');
            }
            if (totalBalance === undefined || totalBalance === null) {
                missingFields.push('saldo actual');
            }
            
            if (missingFields.length > 0) {
                validation.warnings.push({
                    type: 'missing_balance_data',
                    message: `No se pueden validar saldos: faltan datos de ${missingFields.join(' y ')}`,
                    severity: 'medium'
                });
                console.log('⚠️ Campos faltantes para validación de saldo:', missingFields);
            } else {
                console.log('✅ Validación de saldo omitida por valores en 0 (válido)');
            }
        }

        // ==================== VALIDACIÓN 2: PAGO MÍNIMO ≤ SALDO ACTUAL ====================
        // Permitir 0 como valor válido - solo rechazar undefined/null
        if (minimumPayment !== undefined && minimumPayment !== null && 
            totalBalance !== undefined && totalBalance !== null) {
            
            const normalizedMinPayment = Math.abs(minimumPayment);
            const normalizedTotalBalance = Math.abs(totalBalance);

            console.log('💳 Validación 2 - Pago mínimo vs saldo:', {
                minimumPayment: normalizedMinPayment,
                totalBalance: normalizedTotalBalance,
                isValid: normalizedMinPayment <= normalizedTotalBalance
            });

            // Caso especial: Si ambos son 0, está perfecto (tarjeta pagada)
            if (normalizedMinPayment === 0 && normalizedTotalBalance === 0) {
                console.log('✅ Validación 2 OK - Tarjeta totalmente pagada (0/0)');
            } else if (normalizedMinPayment > normalizedTotalBalance) {
                validation.warnings.push({
                    type: 'minimum_payment_exceeds_balance',
                    field: 'minimumPayment',
                    message: `El pago mínimo ($${normalizedMinPayment.toLocaleString()}) es mayor que el saldo actual ($${normalizedTotalBalance.toLocaleString()})`,
                    severity: 'high',
                    minimumPayment: normalizedMinPayment,
                    totalBalance: normalizedTotalBalance,
                    difference: normalizedMinPayment - normalizedTotalBalance
                });
                console.log('❌ Validación 2 FALLA - Pago mínimo mayor al saldo');
            } else {
                console.log('✅ Validación 2 OK - Pago mínimo válido');
            }
        } else {
            // Solo reportar error si realmente faltan datos (no si son 0)
            const missingFields = [];
            if (minimumPayment === undefined || minimumPayment === null) {
                missingFields.push('pago mínimo');
            }
            if (totalBalance === undefined || totalBalance === null) {
                missingFields.push('saldo actual');
            }
            
            if (missingFields.length > 0) {
                validation.warnings.push({
                    type: 'missing_payment_data',
                    message: `No se puede validar pago mínimo: faltan datos de ${missingFields.join(' y ')}`,
                    severity: 'low'
                });
                console.log('⚠️ Campos faltantes para validación de pago mínimo:', missingFields);
            } else {
                console.log('✅ Validación de pago mínimo omitida por valores en 0 (válido)');
            }
        }

        // ==================== VALIDACIÓN 3: FECHA DE VENCIMIENTO ≤ 25 DÍAS DEL CORTE ====================
        if (dueDate && statementDate) {
            try {
                const dueDateObj = new Date(dueDate);
                const statementDateObj = new Date(statementDate);
                
                // Calcular diferencia en días
                const timeDifference = dueDateObj.getTime() - statementDateObj.getTime();
                const daysDifference = Math.ceil(timeDifference / (1000 * 3600 * 24));

                console.log('📅 Validación 3 - Fecha de vencimiento:', {
                    statementDate,
                    dueDate,
                    daysDifference,
                    isValid: daysDifference <= 25
                });

                if (daysDifference > 25) {
                    validation.warnings.push({
                        type: 'due_date_too_far',
                        field: 'dueDate',
                        message: `La fecha de vencimiento (${dueDate}) está a ${daysDifference} días del corte (${statementDate}), máximo permitido: 25 días`,
                        severity: 'medium',
                        statementDate,
                        dueDate,
                        daysDifference,
                        maxAllowed: 25
                    });
                } else if (daysDifference < 0) {
                    validation.warnings.push({
                        type: 'due_date_before_statement',
                        field: 'dueDate',
                        message: `La fecha de vencimiento (${dueDate}) es anterior a la fecha de corte (${statementDate})`,
                        severity: 'high',
                        statementDate,
                        dueDate,
                        daysDifference
                    });
                }
            } catch (error) {
                validation.warnings.push({
                    type: 'invalid_date_format',
                    message: `Error procesando fechas: ${error.message}`,
                    severity: 'medium'
                });
            }
        } else {
            validation.warnings.push({
                type: 'missing_date_data',
                message: 'No se puede validar fechas: faltan datos de fecha de corte o vencimiento',
                severity: 'low'
            });
        }

        // ==================== GENERAR SUGERENCIAS ====================
        generateSuggestions(validation);

        // ==================== RESULTADO FINAL ====================
        validation.isValid = validation.errors.length === 0 && 
                           validation.warnings.filter(w => w.severity === 'high').length === 0;

        console.log('✅ Validación completada:', {
            isValid: validation.isValid,
            errorsCount: validation.errors.length,
            warningsCount: validation.warnings.length,
            highSeverityWarnings: validation.warnings.filter(w => w.severity === 'high').length,
            suggestionsCount: validation.suggestions.length
        });

    } catch (error) {
        validation.isValid = false;
        validation.errors.push({
            type: 'validation_error',
            message: `Error durante la validación: ${error.message}`,
            severity: 'high'
        });
    }

    return validation;
};

/**
 * Busca el saldo anterior en la lista de transacciones
 * @param {Array} transactions - Lista de transacciones
 * @returns {number|null} - Saldo anterior encontrado o null
 */
const findPreviousBalanceInTransactions = (transactions) => {
    console.log('🔍 Buscando saldo anterior en transacciones...');
    
    for (let i = 0; i < Math.min(transactions.length, 5); i++) { // Revisar las primeras 5 transacciones
        const transaction = transactions[i];
        const description = (transaction.description || '').toLowerCase();
        
        console.log(`📄 Transacción ${i + 1}:`, {
            description: transaction.description?.substring(0, 50) + '...',
            amount: transaction.amount,
            type: transaction.type
        });
        
        // Buscar patrones que indiquen saldo anterior
        if (description.includes('saldo anterior') || 
            description.includes('balance anterior') || 
            description.includes('saldo previo') ||
            description.includes('previous balance') ||
            description.includes('balance brought forward') ||
            description.includes('saldo inicial') ||
            description.includes('balance inicial') ||
            (i === 0 && (description.includes('saldo') || description.includes('balance')))) {
            
            const amount = parseFloat(transaction.amount);
            if (!isNaN(amount) && amount !== 0) {
                console.log(`✅ Saldo anterior encontrado: $${Math.abs(amount)} en "${transaction.description}"`);
                return Math.abs(amount);
            }
        }
        
        // Si la primera transacción es un tipo específico y tiene monto significativo
        if (i === 0 && transaction.type === 'saldo_anterior' && transaction.amount) {
            const amount = parseFloat(transaction.amount);
            if (!isNaN(amount)) {
                console.log(`✅ Saldo anterior por tipo: $${Math.abs(amount)}`);
                return Math.abs(amount);
            }
        }
    }
    
    console.log('❌ No se encontró saldo anterior en transacciones');
    return null;
};

/**
 * Calcula totales desde las transacciones
 * 
 * IMPORTANTE: Esta función normaliza todos los montos a valores absolutos para la fórmula de saldo:
 * - Los cargos (gastos) se convierten a positivos, independientemente de su signo en el PDF
 * - Los pagos (abonos) se convierten a positivos, independientemente de su signo en el PDF
 * 
 * Esto es necesario porque en las tarjetas de crédito:
 * - Saldo positivo = deuda (debes dinero)
 * - Saldo negativo = saldo a favor (tienes crédito)
 * - La fórmula: Saldo Anterior + Cargos - Pagos = Saldo Actual
 */
const calculateTotalsFromTransactions = (transactions) => {
    const totals = {
        totalCharges: 0,
        totalPayments: 0,
        totalFees: 0,
        totalInterest: 0,
        transactionCount: transactions.length
    };

    console.log('💰 Calculando totales desde transacciones...');
    
    // Desagrupar transacciones si están agrupadas
    const flattenedTransactions = flattenGroupedTransactions(transactions);
    console.log(`📊 Transacciones originales: ${transactions.length}, Transacciones desagrupadas: ${flattenedTransactions.length}`);
    
    // 🔍 [DEBUG] FILTRAR TRANSACCIONES DE TIPO "AJUSTE"
    const operationalTransactions = flattenedTransactions.filter(transaction => {
        const isAdjustment = transaction.type === 'ajuste';
        if (isAdjustment) {
            console.log(`🔍 [DEBUG] Excluyendo transacción de tipo "ajuste": ${transaction.description} | ${transaction.amount}`);
        }
        return !isAdjustment; // Solo incluir transacciones operacionales
    });
    
    console.log(`🔍 [DEBUG] Transacciones operacionales (excluyendo ajustes): ${operationalTransactions.length}`);
    
    operationalTransactions.forEach((transaction, index) => {
        const amount = parseFloat(transaction.amount) || 0;
        const normalizedAmount = Math.abs(amount); // Normalizar a valor absoluto
        const description = (transaction.description || '').toLowerCase();
        const group = transaction.group || 'general'; // Grupo al que pertenece la transacción
        
        // Detectar tipo de transacción de forma más inteligente
        let detectedType = transaction.type;
        
        // Re-clasificar basándose en la descripción si es necesario
        if (description.includes('pago') || description.includes('abono') || 
            description.includes('payment') || description.includes('transferencia') ||
            (amount < 0 && (description.includes('pago') || description.includes('abono')))) {
            detectedType = 'pago';
        } else if (description.includes('compra') || description.includes('cargo') || 
                   description.includes('purchase') || description.includes('débito') ||
                   (amount > 0 && !description.includes('pago') && !description.includes('abono'))) {
            detectedType = 'cargo';
        }
        
        console.log(`📊 Transacción operacional ${index + 1} [${group}]:`, {
            description: transaction.description?.substring(0, 30) + '...',
            originalType: transaction.type,
            detectedType,
            originalAmount: amount,
            normalizedAmount,
            isNegative: amount < 0,
            group: group
        });
        
        if (detectedType === 'cargo' || detectedType === 'charge') {
            // Para cargos, usar valor absoluto (siempre positivo para la fórmula)
            // Nota: En PDFs, los cargos pueden venir con signo negativo, pero los convertimos a positivo
            totals.totalCharges += normalizedAmount;
            
            // Detectar comisiones e intereses en las descripciones
            if (description.includes('comisión') || description.includes('comision') || 
                description.includes('fee') || description.includes('cargo por')) {
                totals.totalFees += normalizedAmount;
            }
            if (description.includes('interés') || description.includes('interes') || 
                description.includes('interest') || description.includes('financiamiento')) {
                totals.totalInterest += normalizedAmount;
            }
            
            console.log(`💸 Cargo detectado #${index + 1} [${group}]: ${normalizedAmount} (original: ${amount}, signo: ${amount >= 0 ? '+' : '-'})`);
        } else if (detectedType === 'pago' || detectedType === 'payment' || detectedType === 'abono') {
            // Para pagos, usar valor absoluto (siempre positivo para la fórmula)
            // Nota: En PDFs, los pagos pueden venir con signo positivo, pero los mantenemos positivos
            totals.totalPayments += normalizedAmount;
            
            console.log(`💳 Pago detectado #${index + 1} [${group}]: ${normalizedAmount} (original: ${amount}, signo: ${amount >= 0 ? '+' : '-'})`);
            console.log(`💰 Total de pagos acumulado hasta ahora: ${totals.totalPayments}`);
        } else {
            // Transacción no clasificada - intentar clasificar por monto
            console.log(`❓ Transacción no clasificada [${group}], usando heurística por monto`);
            if (amount < 0) {
                // Monto negativo probablemente es un pago (abono)
                totals.totalPayments += normalizedAmount;
                console.log(`💳 Clasificado como pago por monto negativo #${index + 1} [${group}]: ${normalizedAmount} (original: ${amount})`);
                console.log(`💰 Total de pagos acumulado hasta ahora: ${totals.totalPayments}`);
            } else {
                // Monto positivo probablemente es un cargo (gasto)
                totals.totalCharges += normalizedAmount;
                console.log(`💸 Clasificado como cargo por monto positivo [${group}]: ${normalizedAmount}`);
            }
        }
    });

    // Resumen final con desglose de pagos (solo transacciones operacionales)
    const paymentTransactions = operationalTransactions.filter(t => {
        const amount = parseFloat(t.amount) || 0;
        const description = (t.description || '').toLowerCase();
        const detectedType = t.type;
        
        return (detectedType === 'pago' || detectedType === 'payment' || detectedType === 'abono') ||
               (description.includes('pago') || description.includes('abono') || description.includes('payment')) ||
               (amount < 0 && !detectedType?.includes('cargo'));
    });
    
    console.log('📊 Totales calculados (excluyendo ajustes):', totals);
    console.log(`🔍 [DEBUG] Transacciones excluidas por tipo "ajuste": ${flattenedTransactions.length - operationalTransactions.length}`);
    console.log(`💳 Resumen de pagos encontrados (${paymentTransactions.length}):`);
    paymentTransactions.forEach((payment, index) => {
        const amount = parseFloat(payment.amount) || 0;
        const group = payment.group || 'general';
        console.log(`  ${index + 1}. [${group}] ${payment.description?.substring(0, 40)}... → ${Math.abs(amount)} (original: ${amount})`);
    });
    console.log(`💰 Total de pagos sumado: ${totals.totalPayments}`);
    
    // Resumen final para debugging de la fórmula de saldo
    console.log('🧮 RESUMEN PARA FÓRMULA DE SALDO:');
    console.log(`  • Total Cargos (gastos): $${totals.totalCharges} (siempre positivo para la fórmula)`);
    console.log(`  • Total Pagos (abonos): $${totals.totalPayments} (siempre positivo para la fórmula)`);
    console.log(`  • Fórmula: Saldo Anterior + ${totals.totalCharges} - ${totals.totalPayments} = Saldo Esperado`);
    
    return totals;
};

/**
 * Desagrupa transacciones que pueden estar agrupadas en el estado de cuenta
 * Los estados de cuenta suelen agrupar transacciones por:
 * - Pagos (al inicio)
 * - Débitos por cargos financieros
 * - Grupos por tarjetas adicionales
 * - Comisiones e intereses
 * 
 * @param {Array} transactions - Array de transacciones que pueden estar agrupadas
 * @returns {Array} Array de transacciones desagrupadas con información del grupo
 */
const flattenGroupedTransactions = (transactions) => {
    const flattened = [];
    
    transactions.forEach((transaction, index) => {
        // Si la transacción ya tiene un grupo definido, mantenerlo
        if (transaction.group) {
            flattened.push(transaction);
            return;
        }
        
        // Detectar si es una transacción agrupada basándose en la descripción
        const description = (transaction.description || '').toLowerCase();
        const amount = parseFloat(transaction.amount) || 0;
        
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
            console.log(`💳 [DEBUG] Transacción ${index + 1} desagrupada como 'pagos' por:`, {
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
            console.log(`💰 [DEBUG] Transacción ${index + 1} desagrupada como 'comisiones'`);
        } 
        // PRIORIDAD 3: Intereses
        else if (description.includes('interés') || description.includes('interes') ||
                 description.includes('interest') || description.includes('financiamiento') ||
                 description.includes('financing') || description.includes('cargo por financiamiento')) {
            detectedGroup = 'intereses';
            console.log(`📈 [DEBUG] Transacción ${index + 1} desagrupada como 'intereses'`);
        } 
        // PRIORIDAD 4: Tarjetas adicionales
        else if (description.includes('tarjeta adicional') || description.includes('additional card') ||
                 description.includes('titular') || description.includes('cardholder') ||
                 description.includes('tarjeta suplementaria') || description.includes('supplementary card') ||
                 description.includes('cargo por tarjeta adicional')) {
            detectedGroup = 'tarjeta_adicional';
            console.log(`🔄 [DEBUG] Transacción ${index + 1} desagrupada como 'tarjeta_adicional'`);
        } 
        // PRIORIDAD 5: Compras y cargos (por defecto)
        else if (description.includes('compra') || description.includes('cargo') ||
                 description.includes('purchase') || description.includes('débito') ||
                 description.includes('debito') || description.includes('debit') ||
                 description.includes('transacción') || description.includes('transaction') ||
                 amount > 0) {
            detectedGroup = 'compras';
            console.log(`🛒 [DEBUG] Transacción ${index + 1} desagrupada como 'compras' por:`, {
                description: description,
                amount: amount,
                reason: amount > 0 ? 'monto positivo' : 'patrón de descripción'
            });
        } else {
            console.log(`⚠️ [DEBUG] Transacción ${index + 1} desagrupada como 'general' (sin patrón detectado):`, {
                description: description,
                amount: amount
            });
        }
        
        // Agregar la transacción con información del grupo
        flattened.push({
            ...transaction,
            group: detectedGroup
        });
    });
    
    return flattened;
};

/**
 * Función exportada para desagrupar transacciones en otros componentes
 * @param {Array} transactions - Array de transacciones que pueden estar agrupadas
 * @returns {Array} Array de transacciones desagrupadas con información del grupo
 */
export const getFlattenedTransactions = (transactions) => {
    return flattenGroupedTransactions(transactions);
};

/**
 * Genera sugerencias específicas para las 3 validaciones
 */
const generateSuggestions = (validation) => {
    const { warnings, errors } = validation;

    // Sugerencias para fórmula de saldo
    if (warnings.some(w => w.type === 'balance_formula_mismatch')) {
        validation.suggestions.push({
            type: 'balance_formula_error',
            message: 'La fórmula de saldo no cuadra. Verifica que todas las transacciones estén capturadas correctamente.',
            action: 'review_transactions'
        });
    }

    // Sugerencias para pago mínimo
    if (warnings.some(w => w.type === 'minimum_payment_exceeds_balance')) {
        validation.suggestions.push({
            type: 'minimum_payment_error',
            message: 'El pago mínimo es mayor que el saldo. Esto es inusual, verifica los datos extraídos.',
            action: 'verify_minimum_payment'
        });
    }

    // Sugerencias para fechas
    if (warnings.some(w => w.type === 'due_date_too_far' || w.type === 'due_date_before_statement')) {
        validation.suggestions.push({
            type: 'date_error',
            message: 'Las fechas no parecen correctas. Verifica que las fechas de corte y vencimiento estén bien extraídas.',
            action: 'verify_dates'
        });
    }

    // Sugerencia general si hay errores críticos
    if (errors.length > 0 || warnings.filter(w => w.severity === 'high').length > 0) {
        validation.suggestions.push({
            type: 'manual_review',
            message: 'Se detectaron problemas importantes. Revisa manualmente los datos antes de confiar en ellos.',
            action: 'manual_verification'
        });
    }
};

/**
 * Formatea un resultado de validación para mostrar al usuario
 */
export const formatValidationResult = (validation) => {
    const result = {
        status: validation.isValid ? 'success' : 'warning',
        title: validation.isValid ? '✅ Datos Validados' : '⚠️ Datos Requieren Atención',
        summary: '',
        details: []
    };

    if (validation.isValid) {
        result.summary = 'Los datos extraídos parecen consistentes y confiables.';
    } else {
        const highSeverityCount = validation.warnings.filter(w => w.severity === 'high').length + validation.errors.length;
        result.summary = `Se detectaron ${highSeverityCount} problemas importantes que requieren atención.`;
    }

    // Agregar detalles de errores y advertencias
    validation.errors.forEach(error => {
        result.details.push({
            type: 'error',
            icon: '❌',
            message: error.message
        });
    });

    validation.warnings.forEach(warning => {
        const icon = warning.severity === 'high' ? '⚠️' : 'ℹ️';
        result.details.push({
            type: 'warning',
            icon,
            message: warning.message,
            severity: warning.severity
        });
    });

    // Agregar sugerencias
    validation.suggestions.forEach(suggestion => {
        result.details.push({
            type: 'suggestion',
            icon: '💡',
            message: suggestion.message
        });
    });

    return result;
};

/**
 * Obtiene un resumen de confianza de los datos
 */
export const getConfidenceScore = (validation) => {
    let score = 100;

    // Restar puntos por errores y advertencias
    validation.errors.forEach(() => score -= 25);
    validation.warnings.forEach(warning => {
        if (warning.severity === 'high') score -= 15;
        else if (warning.severity === 'medium') score -= 8;
        else score -= 3;
    });

    return Math.max(0, score);
};
