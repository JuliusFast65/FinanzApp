// Script de prueba para la nueva lógica de confianza
// Simula diferentes escenarios de datos para verificar el cálculo

// Simular la función getConfidenceScore
const getConfidenceScore = (validation) => {
    let score = 100;

    // Restar puntos por errores y advertencias
    validation.errors.forEach(() => score -= 25);
    validation.warnings.forEach(warning => {
        if (warning.severity === 'high') score -= 15;
        else if (warning.severity === 'medium') score -= 8;
        else score -= 3;
    });

    // Penalizar por falta de datos completos
    // Si no hay suficientes datos para hacer validaciones, la confianza debe ser baja
    const hasBalanceData = validation.calculations && (
        validation.calculations.hasPreviousBalance || 
        validation.calculations.hasCurrentBalance
    );
    
    const hasPaymentData = validation.calculations && (
        validation.calculations.hasMinimumPayment || 
        validation.calculations.hasPayments
    );
    
    const hasTransactionData = validation.calculations && 
        validation.calculations.totalTransactions > 0;
    
    const hasDateData = validation.calculations && (
        validation.calculations.hasStatementDate || 
        validation.calculations.hasDueDate
    );

    // Si faltan datos críticos, penalizar significativamente
    if (!hasBalanceData) score -= 30; // Sin datos de saldo
    if (!hasPaymentData) score -= 25; // Sin datos de pagos
    if (!hasTransactionData) score -= 20; // Sin transacciones
    if (!hasDateData) score -= 15; // Sin fechas

    // Si no hay suficientes datos para hacer validaciones básicas, 
    // la confianza máxima debería ser 50%
    if (!hasBalanceData && !hasPaymentData && !hasTransactionData) {
        score = Math.min(score, 50);
    }

    return Math.max(0, score);
};

// Escenario 1: Datos completos (confianza alta)
console.log('=== ESCENARIO 1: DATOS COMPLETOS ===');
const validation1 = {
    errors: [],
    warnings: [],
    calculations: {
        hasPreviousBalance: true,
        hasCurrentBalance: true,
        hasMinimumPayment: true,
        hasPayments: true,
        hasStatementDate: true,
        hasDueDate: true,
        totalTransactions: 15
    }
};
console.log('Confianza:', getConfidenceScore(validation1) + '%');

// Escenario 2: Datos mínimos (confianza media)
console.log('\n=== ESCENARIO 2: DATOS MÍNIMOS ===');
const validation2 = {
    errors: [],
    warnings: [],
    calculations: {
        hasPreviousBalance: false,
        hasCurrentBalance: true,
        hasMinimumPayment: false,
        hasPayments: false,
        hasStatementDate: true,
        hasDueDate: false,
        totalTransactions: 0
    }
};
console.log('Confianza:', getConfidenceScore(validation2) + '%');

// Escenario 3: Casi sin datos (confianza baja)
console.log('\n=== ESCENARIO 3: CASI SIN DATOS ===');
const validation3 = {
    errors: [],
    warnings: [
        { severity: 'low', message: 'No se pueden validar saldos' },
        { severity: 'low', message: 'No se puede validar pago mínimo' },
        { severity: 'low', message: 'No se puede validar fechas' }
    ],
    calculations: {
        hasPreviousBalance: false,
        hasCurrentBalance: false,
        hasMinimumPayment: false,
        hasPayments: false,
        hasStatementDate: false,
        hasDueDate: false,
        totalTransactions: 0
    }
};
console.log('Confianza:', getConfidenceScore(validation3) + '%');

// Escenario 4: Con errores y sin datos (confianza muy baja)
console.log('\n=== ESCENARIO 4: CON ERRORES Y SIN DATOS ===');
const validation4 = {
    errors: [
        { message: 'Error de validación' }
    ],
    warnings: [
        { severity: 'high', message: 'Problema crítico' }
    ],
    calculations: {
        hasPreviousBalance: false,
        hasCurrentBalance: false,
        hasMinimumPayment: false,
        hasPayments: false,
        hasStatementDate: false,
        hasDueDate: false,
        totalTransactions: 0
    }
};
console.log('Confianza:', getConfidenceScore(validation4) + '%');

// Escenario 5: Solo transacciones (confianza media-baja)
console.log('\n=== ESCENARIO 5: SOLO TRANSACCIONES ===');
const validation5 = {
    errors: [],
    warnings: [
        { severity: 'low', message: 'No se pueden validar saldos' }
    ],
    calculations: {
        hasPreviousBalance: false,
        hasCurrentBalance: false,
        hasMinimumPayment: false,
        hasPayments: false,
        hasStatementDate: false,
        hasDueDate: false,
        totalTransactions: 8
    }
};
console.log('Confianza:', getConfidenceScore(validation5) + '%');
