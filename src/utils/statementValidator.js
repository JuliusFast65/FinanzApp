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
            
            const normalizedPreviousBalance = Math.abs(effectivePreviousBalance);
            const normalizedTotalBalance = Math.abs(totalBalance);
            
            // Fórmula: Saldo Anterior + Cargos - Pagos = Saldo Actual
            const expectedBalance = normalizedPreviousBalance + calculatedTotals.totalCharges - calculatedTotals.totalPayments;
            const balanceDifference = Math.abs(normalizedTotalBalance - expectedBalance);

            console.log('🧮 Validación 1 - Fórmula de saldo:', {
                previousBalance: normalizedPreviousBalance,
                totalCharges: calculatedTotals.totalCharges,
                totalPayments: calculatedTotals.totalPayments,
                expectedBalance,
                actualBalance: normalizedTotalBalance,
                difference: balanceDifference
            });

            // Caso especial: Si todo es 0, está perfecto (tarjeta sin actividad/pagada)
            if (normalizedPreviousBalance === 0 && normalizedTotalBalance === 0 && 
                calculatedTotals.totalCharges === 0 && calculatedTotals.totalPayments === 0) {
                console.log('✅ Validación 1 OK - Tarjeta sin actividad (0+0-0=0)');
            } else {
                // Tolerancia: hasta $10 o 1% del saldo
                const tolerance = Math.max(10, normalizedTotalBalance * 0.01);
                
                if (balanceDifference <= tolerance) {
                    console.log('✅ Validación 1 OK - Fórmula de saldo correcta');
                } else {
                    validation.warnings.push({
                        type: 'balance_formula_mismatch',
                        field: 'totalBalance',
                        message: `Fórmula de saldo no cuadra: Saldo anterior ($${normalizedPreviousBalance.toLocaleString()}) + Cargos ($${calculatedTotals.totalCharges.toLocaleString()}) - Pagos ($${calculatedTotals.totalPayments.toLocaleString()}) = $${expectedBalance.toLocaleString()}, pero el saldo reportado es $${normalizedTotalBalance.toLocaleString()}`,
                        severity: 'high',
                        expected: expectedBalance,
                        actual: normalizedTotalBalance,
                        difference: balanceDifference,
                        tolerance: tolerance
                    });
                    console.log('❌ Validación 1 FALLA - Fórmula de saldo incorrecta');
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
    
    transactions.forEach((transaction, index) => {
        const amount = parseFloat(transaction.amount) || 0;
        const normalizedAmount = Math.abs(amount); // Normalizar a valor absoluto
        const description = (transaction.description || '').toLowerCase();
        
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
        
        console.log(`📊 Transacción ${index + 1}:`, {
            description: transaction.description?.substring(0, 30) + '...',
            originalType: transaction.type,
            detectedType,
            originalAmount: amount,
            normalizedAmount,
            isNegative: amount < 0
        });
        
        if (detectedType === 'cargo' || detectedType === 'charge') {
            // Para cargos, usar valor absoluto (siempre positivo)
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
        } else if (detectedType === 'pago' || detectedType === 'payment' || detectedType === 'abono') {
            // Para pagos, usar valor absoluto (convertir -319.45 a 319.45)
            totals.totalPayments += normalizedAmount;
            
            console.log(`💳 Pago detectado: ${normalizedAmount} (original: ${amount})`);
        } else {
            // Transacción no clasificada - intentar clasificar por monto
            console.log(`❓ Transacción no clasificada, usando heurística por monto`);
            if (amount < 0) {
                // Monto negativo probablemente es un pago
                totals.totalPayments += normalizedAmount;
                console.log(`💳 Clasificado como pago por monto negativo: ${normalizedAmount}`);
            } else {
                // Monto positivo probablemente es un cargo
                totals.totalCharges += normalizedAmount;
                console.log(`💳 Clasificado como cargo por monto positivo: ${normalizedAmount}`);
            }
        }
    });

    console.log('📊 Totales calculados:', totals);
    return totals;
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
