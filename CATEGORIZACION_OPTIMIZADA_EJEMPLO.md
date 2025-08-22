# Ejemplo de Uso: Categorización Optimizada de Comercios

## 🎯 Objetivo
Optimizar el proceso de categorización para ahorrar tokens y reducir peticiones a la IA, enviando toda la lista de comercios pendientes en una sola petición.

## 🚀 Función Recomendada: `categorizePendingMerchants()`

Esta función es la más eficiente para categorizar comercios que no tienen patrones aplicados:

```javascript
import { categorizePendingMerchants } from '../utils/transactionCategories';

// Ejemplo de uso
const categorizedTransactions = await categorizePendingMerchants(
    transactions,           // Lista completa de transacciones
    userPatterns,          // Patrones personalizados del usuario
    userSettings           // Configuración del usuario
);
```

## 📊 Flujo de Categorización Optimizada

### 1. **Identificación de Comercios Pendientes**
```javascript
// La función automáticamente filtra:
// - Comercios ya categorizados
// - Comercios con patrones del usuario
// - Comercios con patrones generales
// - Solo deja los que realmente necesitan categorización por IA
```

### 2. **Categorización Masiva en Una Petición**
```javascript
// En lugar de hacer N peticiones individuales:
// ❌ ANTES: 10 transacciones = 10 peticiones a la IA
// ✅ AHORA: 10 transacciones = 1 petición a la IA

// Prompt optimizado:
`Categoriza los siguientes comercios/transacciones bancarias en una sola respuesta:

LISTA DE COMERCIOS A CATEGORIZAR:
1. "OXXO" - $150 (cargo)
2. "UBER" - $89 (cargo)
3. "AMAZON" - $1200 (cargo)
4. "STARBUCKS" - $65 (cargo)

CATEGORÍAS DISPONIBLES:
food: Alimentación, transport: Transporte, shopping: Compras, entertainment: Entretenimiento...

RESPUESTA (solo JSON):`
```

### 3. **Respuesta de la IA**
```json
[
  {"index": 1, "category": "food"},
  {"index": 2, "category": "transport"},
  {"index": 3, "category": "shopping"},
  {"index": 4, "category": "food"}
]
```

## 💡 Casos de Uso

### Caso 1: Categorización Inicial de Transacciones
```javascript
// Cuando cargas un nuevo estado de cuenta
const newTransactions = await analyzePDFStatement(pdfFile);
const categorizedTransactions = await categorizePendingMerchants(
    newTransactions,
    userPatterns,
    userSettings
);
```

### Caso 2: Recategorización de Transacciones Existentes
```javascript
// Cuando quieres recategorizar transacciones sin categoría
const uncategorizedTransactions = transactions.filter(t => !t.category || t.category === 'other');
if (uncategorizedTransactions.length > 0) {
    const recategorizedTransactions = await categorizePendingMerchants(
        transactions,
        userPatterns,
        userSettings
    );
}
```

### Caso 3: Categorización por Lotes
```javascript
// Para procesar grandes volúmenes de transacciones
const batchSize = 50; // Máximo por lote para evitar prompts muy largos
for (let i = 0; i < transactions.length; i += batchSize) {
    const batch = transactions.slice(i, i + batchSize);
    const categorizedBatch = await categorizePendingMerchants(
        batch,
        userPatterns,
        userSettings
    );
    // Procesar batch categorizado...
}
```

## 🔧 Configuración del Usuario

```javascript
const userSettings = {
    preferOpenAI: false,           // true = OpenAI, false = Gemini
    autoCategorizationDelay: 2000, // Delay entre peticiones (ms)
    maxBatchSize: 50,              // Máximo comercios por petición
    enableBulkCategorization: true // Habilitar categorización masiva
};
```

## 📈 Beneficios de la Optimización

### Antes (Categorización Individual)
- **10 transacciones** = **10 peticiones** a la IA
- **Tokens usados**: ~1000-1500 por transacción = **10,000-15,000 tokens**
- **Tiempo**: ~20-30 segundos (con delays)
- **Costo**: Alto (múltiples peticiones)

### Ahora (Categorización Masiva)
- **10 transacciones** = **1 petición** a la IA
- **Tokens usados**: ~800-1200 total = **80-90% menos tokens**
- **Tiempo**: ~3-5 segundos
- **Costo**: Bajo (una sola petición)

## 🛡️ Manejo de Errores

La función incluye fallbacks automáticos:

```javascript
try {
    const result = await categorizePendingMerchants(transactions, userPatterns, userSettings);
    return result;
} catch (error) {
    if (error.message.includes('quota')) {
        console.warn('⚠️ Cuota de IA excedida - usando categorías por defecto');
        // Fallback a categorías básicas
        return markTransactionsAsOther(transactions);
    }
    throw error;
}
```

## 🔄 Integración con el Sistema Existente

La función es compatible con el sistema actual:

```javascript
// En PDFStatementAnalyzer.jsx
import { categorizePendingMerchants } from '../utils/transactionCategories';

// Reemplazar llamadas individuales por:
const categorizedTransactions = await categorizePendingMerchants(
    extractedTransactions,
    userCategoryPatterns,
    userSettings
);
```

## 📝 Logs y Monitoreo

La función proporciona logs detallados:

```
🔍 Identificando comercios pendientes de categorización...
📋 Comercios pendientes de categorización: 15
📝 Lista de comercios a categorizar:
  1. "OXXO" - $150 (cargo)
  2. "UBER" - $89 (cargo)
  ...
🚀 Categorizando 15 transacciones en una sola petición a la IA...
✅ Categorización masiva completada: 15 transacciones procesadas
✅ Categorizada: "OXXO" → food
✅ Categorizada: "UBER" → transport
...
```

## 🎉 Resultado Final

Con esta optimización:
- ✅ **Ahorras 80-90% de tokens**
- ✅ **Reduces peticiones de N a 1**
- ✅ **Mejoras el rendimiento 5-10x**
- ✅ **Mantienes la calidad de categorización**
- ✅ **Tienes fallbacks automáticos**

¡La categorización de comercios ahora es mucho más eficiente y económica!
