# Guía de Manejo de Transacciones Agrupadas

## Problema Identificado

Los estados de cuenta de tarjetas de crédito suelen agrupar las transacciones por categorías, lo que puede causar que la IA extraiga solo un grupo o resumen en lugar de todas las transacciones individuales.

## Grupos Comunes en Estados de Cuenta

### 1. **Pagos (al inicio del estado)**
- Transferencias bancarias
- Pagos con cheques
- Pagos en efectivo
- Abonos automáticos

### 2. **Comisiones y Cargos Financieros**
- Comisión por manejo de cuenta
- Cargos por servicios
- Comisiones por retiro en cajero
- Cargos por pagos tardíos
- Cargos por impuestos

### 3. **Intereses y Financiamiento**
- Intereses sobre saldo pendiente
- Cargos por financiamiento
- Intereses por pagos mínimos

### 4. **Tarjetas Adicionales**
- Transacciones de tarjetas secundarias
- Gastos de titulares adicionales
- Límites de tarjetas adicionales

### 5. **Compras y Gastos**
- Compras en comercios
- Retiros en cajeros
- Cargos por servicios

## Solución Implementada

### 1. **Prompts Mejorados para la IA**
Los prompts ahora incluyen instrucciones específicas para:
- Extraer TODAS las transacciones de TODOS los grupos
- NO omitir transacciones por estar agrupadas
- Extraer transacciones individuales incluso si hay resúmenes de grupo

### 2. **Detección Automática de Grupos**
El sistema detecta automáticamente el grupo de cada transacción basándose en:
- Descripción de la transacción
- Monto (positivo/negativo)
- Tipo de transacción
- Patrones de texto comunes

### 3. **Campo `group` en Transacciones**
Cada transacción ahora incluye un campo `group` que indica a qué categoría pertenece:
```json
{
  "date": "2024-01-15",
  "description": "Pago transferencia bancaria",
  "amount": -500.00,
  "type": "pago",
  "group": "pagos"
}
```

### 4. **Función de Desagrupación**
```javascript
import { getFlattenedTransactions } from '../utils/statementValidator';

// Obtener transacciones desagrupadas con información de grupo
const flattenedTransactions = getFlattenedTransactions(transactions);
```

## Uso en Componentes

### En el Validador
El validador ahora procesa todas las transacciones de todos los grupos para calcular totales correctos.

### En el Parser
El parser asigna automáticamente grupos a las transacciones si no están definidos.

### En la UI
Los componentes pueden mostrar las transacciones agrupadas por categoría o mostrar el grupo de cada transacción.

## Ejemplo de Salida

```javascript
// Transacciones originales (pueden estar agrupadas)
const originalTransactions = [
  {
    "date": "2024-01-15",
    "description": "Pago transferencia bancaria",
    "amount": -500.00,
    "type": "pago"
  },
  {
    "date": "2024-01-16",
    "description": "Compra en supermercado",
    "amount": 150.00,
    "type": "cargo"
  }
];

// Transacciones desagrupadas con grupos
const flattenedTransactions = getFlattenedTransactions(originalTransactions);
// Resultado:
[
  {
    "date": "2024-01-15",
    "description": "Pago transferencia bancaria",
    "amount": -500.00,
    "type": "pago",
    "group": "pagos"
  },
  {
    "date": "2024-01-16",
    "description": "Compra en supermercado",
    "amount": 150.00,
    "type": "cargo",
    "group": "compras"
  }
]
```

## Beneficios

1. **Extracción Completa**: La IA ahora extrae todas las transacciones, no solo resúmenes
2. **Cálculos Precisos**: Los totales se calculan correctamente con todas las transacciones
3. **Mejor Organización**: Las transacciones se pueden agrupar y filtrar por categoría
4. **Debugging Mejorado**: Es más fácil identificar problemas en la extracción
5. **Flexibilidad**: Los componentes pueden usar la información de grupo como necesiten

## Consideraciones

- Los grupos se detectan automáticamente pero pueden ser sobrescritos si la IA ya los proporciona
- La detección se basa en patrones comunes en estados de cuenta en español e inglés
- El sistema mantiene compatibilidad con transacciones existentes que no tienen grupo
- Los grupos se pueden personalizar o extender según sea necesario
