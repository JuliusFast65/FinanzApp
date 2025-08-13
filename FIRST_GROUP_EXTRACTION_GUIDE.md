# Guía de Extracción del Primer Grupo de Transacciones

## Problema Identificado

A pesar de las mejoras implementadas para manejar transacciones agrupadas, la IA sigue sin extraer correctamente las transacciones del **primer grupo** en los estados de cuenta, que típicamente incluye:

- **Pagos iniciales** (generalmente al inicio del documento)
- **Cargos iniciales** del período
- **Resúmenes de movimientos** del período anterior
- **Ajustes y correcciones** iniciales

## Solución Implementada

### 1. Prompts Mejorados para la IA

#### OpenAI (GPT-4o)
- **Antes**: Solo instrucciones básicas para extraer transacciones
- **Después**: Instrucciones específicas sobre grupos y énfasis en el primer grupo

```javascript
INSTRUCCIONES IMPORTANTES:
- Los estados de cuenta suelen agrupar transacciones por categorías
- DEBES extraer TODAS las transacciones de TODOS los grupos que encuentres
- Grupos comunes: pagos (al inicio), comisiones, intereses, tarjetas adicionales, compras
- NO omitas transacciones por estar agrupadas - extrae cada una individualmente
- Si hay un resumen de grupo, extrae también las transacciones individuales
- PRESTA ESPECIAL ATENCIÓN al primer grupo (generalmente pagos y cargos iniciales)
- Busca en TODA la página, especialmente en la parte superior donde suelen estar los pagos
- Revisa también secciones de resumen, movimientos del período, y cualquier tabla de transacciones
```

#### Gemini (Gemini-1.5-Flash)
- Mismas instrucciones mejoradas que OpenAI
- Énfasis en la revisión completa de la página

### 2. Lógica de Detección de Grupos Mejorada

#### Patrones de Detección Prioritarios

**PRIORIDAD 1: Pagos y Abonos (Primer Grupo)**
```javascript
if (description.includes('pago') || description.includes('abono') ||
    description.includes('payment') || description.includes('transferencia') ||
    description.includes('depósito') || description.includes('deposito') ||
    description.includes('deposit') || description.includes('crédito') ||
    description.includes('credito') || description.includes('credit') ||
    description.includes('reembolso') || description.includes('refund') ||
    amount < 0) {
    detectedGroup = 'pagos';
}
```

**PRIORIDAD 2: Comisiones y Cargos Financieros**
```javascript
else if (description.includes('comisión') || description.includes('comision') ||
         description.includes('fee') || description.includes('cargo por') ||
         description.includes('cargo financiero') || description.includes('financial charge') ||
         description.includes('cargo por uso') || description.includes('usage charge') ||
         description.includes('cargo por retiro') || description.includes('cash advance fee')) {
    detectedGroup = 'comisiones';
}
```

**PRIORIDAD 3: Intereses**
```javascript
else if (description.includes('interés') || description.includes('interes') ||
         description.includes('interest') || description.includes('financiamiento') ||
         description.includes('financing') || description.includes('cargo por financiamiento')) {
    detectedGroup = 'intereses';
}
```

**PRIORIDAD 4: Tarjetas Adicionales**
```javascript
else if (description.includes('tarjeta adicional') || description.includes('additional card') ||
         description.includes('titular') || description.includes('cardholder') ||
         description.includes('tarjeta suplementaria') || description.includes('supplementary card') ||
         description.includes('cargo por tarjeta adicional')) {
    detectedGroup = 'tarjeta_adicional';
}
```

**PRIORIDAD 5: Compras y Cargos (Por Defecto)**
```javascript
else if (description.includes('compra') || description.includes('cargo') ||
         description.includes('purchase') || description.includes('débito') ||
         description.includes('debito') || description.includes('debit') ||
         description.includes('transacción') || description.includes('transaction') ||
         amount > 0) {
    detectedGroup = 'compras';
}
```

### 3. Archivos Modificados

- `src/components/PDFStatementAnalyzer.jsx` - Prompts mejorados
- `src/utils/jsonParser.js` - Lógica de asignación de grupos mejorada
- `src/utils/statementValidator.js` - Función de desagrupación mejorada

## Instrucciones para la IA

### Prompt Específico para el Primer Grupo

```
PRESTA ESPECIAL ATENCIÓN al primer grupo (generalmente pagos y cargos iniciales)
Busca en TODA la página, especialmente en la parte superior donde suelen estar los pagos
Revisa también secciones de resumen, movimientos del período, y cualquier tabla de transacciones
```

### Elementos a Buscar en el Primer Grupo

1. **Sección de Resumen del Período**
   - Pagos realizados
   - Cargos del período
   - Ajustes y correcciones

2. **Parte Superior del Documento**
   - Información de pagos
   - Resúmenes de movimientos
   - Totales del período

3. **Tablas de Movimientos**
   - Transacciones agrupadas por tipo
   - Resúmenes de grupos
   - Detalles de cada transacción

## Casos de Uso Comunes

### Caso 1: Estado de Cuenta con Pagos al Inicio
```
PRIMER GRUPO:
- Pago realizado: $500.00
- Cargo por uso: $25.00
- Interés del período: $15.00

SEGUNDO GRUPO:
- Compras del período...
```

### Caso 2: Estado de Cuenta con Resumen Inicial
```
RESUMEN DEL PERÍODO:
- Saldo anterior: $1,000.00
- Pagos: $500.00
- Cargos: $300.00
- Saldo actual: $800.00

DETALLE DE MOVIMIENTOS:
- Pago 15/01: $500.00
- Cargo 20/01: $300.00
```

## Verificación de Funcionamiento

### 1. Revisar Logs de Consola
```javascript
console.log('🔍 [DEBUG] Transacciones con grupos:', transactions.map(t => ({
    description: t.description,
    amount: t.amount,
    group: t.group
})));
```

### 2. Verificar en la UI
- Columna "Grupo" debe mostrar "💳 pagos" para transacciones del primer grupo
- Todas las transacciones deben tener un grupo asignado
- No debe haber transacciones con grupo "general" a menos que sea apropiado

### 3. Validación de Datos
- El total de transacciones debe coincidir con el resumen del estado
- Los pagos deben aparecer como montos negativos
- Los cargos deben aparecer como montos positivos

## Consideraciones Adicionales

### 1. Diferentes Formatos de Estado
- Algunos bancos agrupan de manera diferente
- Puede haber variaciones en la terminología
- La posición del primer grupo puede variar

### 2. Fallbacks de Detección
- Si la IA no asigna grupos, se asignan automáticamente
- La lógica prioriza pagos sobre otros tipos
- Los montos negativos se consideran pagos por defecto

### 3. Mejoras Futuras
- Aprendizaje automático de patrones del usuario
- Detección de nuevos tipos de grupos
- Personalización por banco específico

## Resumen de Cambios

1. **Prompts Mejorados**: Instrucciones específicas sobre grupos y énfasis en el primer grupo
2. **Detección Robusta**: Más patrones y priorización clara de grupos
3. **Logging Mejorado**: Mejor visibilidad del proceso de agrupación
4. **Fallbacks Inteligentes**: Asignación automática de grupos cuando la IA falla

Estos cambios deberían resolver el problema de extracción del primer grupo de transacciones en la mayoría de los casos.
