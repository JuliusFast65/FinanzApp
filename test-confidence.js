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

// Escenario 1: Datos completos
const validation1 = {
    hasValidTotalBalance: true,
    hasValidPreviousBalance: true,
    hasValidMinimumPayment: true,
    hasValidDueDate: true,
    hasValidStatementDate: true,
    hasValidTransactions: true,
    transactionsHaveValidDates: true,
    transactionsHaveValidAmounts: true,
    transactionsHaveValidDescriptions: true,
    transactionsHaveValidTypes: true,
    transactionsHaveValidGroups: true,
    balanceCalculationMatches: true,
    noDuplicateTransactions: true,
    transactionsAreChronological: true
};

// console.log('=== ESCENARIO 1: DATOS COMPLETOS ===');
// console.log('Validación:', validation1);
// console.log('Confianza:', getConfidenceScore(validation1) + '%');

// Escenario 2: Datos mínimos
const validation2 = {
    hasValidTotalBalance: true,
    hasValidPreviousBalance: false,
    hasValidMinimumPayment: false,
    hasValidDueDate: false,
    hasValidStatementDate: false,
    hasValidTransactions: true,
    transactionsHaveValidDates: true,
    transactionsHaveValidAmounts: true,
    transactionsHaveValidDescriptions: true,
    transactionsHaveValidTypes: false,
    transactionsHaveValidGroups: false,
    balanceCalculationMatches: false,
    noDuplicateTransactions: true,
    transactionsAreChronological: true
};

// console.log('\n=== ESCENARIO 2: DATOS MÍNIMOS ===');
// console.log('Validación:', validation2);
// console.log('Confianza:', getConfidenceScore(validation2) + '%');

// Escenario 3: Casi sin datos
const validation3 = {
    hasValidTotalBalance: false,
    hasValidPreviousBalance: false,
    hasValidMinimumPayment: false,
    hasValidDueDate: false,
    hasValidStatementDate: false,
    hasValidTransactions: true,
    transactionsHaveValidDates: false,
    transactionsHaveValidAmounts: false,
    transactionsHaveValidDescriptions: false,
    transactionsHaveValidTypes: false,
    transactionsHaveValidGroups: false,
    balanceCalculationMatches: false,
    noDuplicateTransactions: false,
    transactionsAreChronological: false
};

// console.log('\n=== ESCENARIO 3: CASI SIN DATOS ===');
// console.log('Validación:', validation3);
// console.log('Confianza:', getConfidenceScore(validation3) + '%');

// Escenario 4: Con errores y sin datos
const validation4 = {
    hasValidTotalBalance: false,
    hasValidPreviousBalance: false,
    hasValidMinimumPayment: false,
    hasValidDueDate: false,
    hasValidStatementDate: false,
    hasValidTransactions: false,
    transactionsHaveValidDates: false,
    transactionsHaveValidAmounts: false,
    transactionsHaveValidDescriptions: false,
    transactionsHaveValidTypes: false,
    transactionsHaveValidGroups: false,
    balanceCalculationMatches: false,
    noDuplicateTransactions: false,
    transactionsAreChronological: false
};

// console.log('\n=== ESCENARIO 4: CON ERRORES Y SIN DATOS ===');
// console.log('Validación:', validation4);
// console.log('Confianza:', getConfidenceScore(validation4) + '%');

// Escenario 5: Solo transacciones
const validation5 = {
    hasValidTotalBalance: false,
    hasValidPreviousBalance: false,
    hasValidMinimumPayment: false,
    hasValidDueDate: false,
    hasValidStatementDate: false,
    hasValidTransactions: true,
    transactionsHaveValidDates: true,
    transactionsHaveValidAmounts: true,
    transactionsHaveValidDescriptions: true,
    transactionsHaveValidTypes: true,
    transactionsHaveValidGroups: true,
    balanceCalculationMatches: false,
    noDuplicateTransactions: true,
    transactionsAreChronological: true
};

// console.log('\n=== ESCENARIO 5: SOLO TRANSACCIONES ===');
// console.log('Validación:', validation5);
// console.log('Confianza:', getConfidenceScore(validation5) + '%');
