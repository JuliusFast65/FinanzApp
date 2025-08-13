# 🔍 Guía de Interpretación de Tipos de Transacción

## 🎯 **Objetivo**
Este documento explica cómo la IA debe interpretar correctamente los **tipos de operación** y **columnas de signo** para identificar transacciones de devolución, pagos y cargos.

## 🚨 **Problema Actual**
La IA está extrayendo todas las transacciones, pero **no está interpretando correctamente** las transacciones de devolución como:
- **WAL-MART #3311 SE2 US 840** con tipo `"DEV"` (devolución)
- Debería ser tipo `"pago"` (crédito), no `"cargo"`

## 🔧 **Solución: Jerarquía de Interpretación**

### **1. PRIORIDAD ALTA: Tipo de Operación**
Los códigos de tipo de operación son **definitivos** y deben tener prioridad:

```json
{
  "DEV": "devolución" → tipo "pago" (crédito)
  "CV": "crédito" → tipo "pago" (crédito)  
  "PAGO": "pago" → tipo "pago" (crédito)
  "N/D": "nota de débito" → tipo "cargo" (débito)
  "CONS.": "consumo" → tipo "cargo" (débito)
  "SALDO ANTERIOR": "balance inicial" → tipo "ajuste"
}
```

### **2. PRIORIDAD MEDIA: Columnas de Signo**
Las columnas de signo son **indicadores claros** del tipo de transacción:

```json
{
  "Columna +/-": {
    "+": "débito" → tipo "cargo" (aumenta deuda)
    "-": "crédito" → tipo "pago" (reduce deuda)
    "vacía": revisar tipo de operación
  },
  "Columna SIGNO": {
    "D": "débito" → tipo "cargo"
    "C": "crédito" → tipo "pago"
    "+": "débito" → tipo "cargo"
    "-": "crédito" → tipo "pago"
  }
}
```

### **3. PRIORIDAD BAJA: Monto**
El monto es **orientativo** pero no definitivo:

```json
{
  "Monto negativo": generalmente crédito (reduce deuda)
  "Monto positivo": generalmente débito (aumenta deuda)
  "EXCEPCIÓN": El tipo de operación y signo tienen prioridad
}
```

## 📊 **Ejemplos del Estado de Cuenta Actual**

### **✅ Transacción Correctamente Interpretada**
```json
{
  "date": "2022-04-18",
  "description": "*** SU PAGO - MUCHAS GRACIAS ***",
  "amount": -378.64,
  "type": "pago",        // ← CORRECTO: tipo "PAGO" = crédito
  "group": "pagos"
}
```

### **❌ Transacción Mal Interpretada (ANTES)**
```json
{
  "date": "2022-04-03", 
  "description": "WAL-MART #3311 SE2 US 840",
  "amount": 67.16,
  "type": "cargo",       // ← INCORRECTO: tipo "DEV" = devolución = crédito
  "group": "pagos"
}
```

### **✅ Transacción Correctamente Interpretada (DESPUÉS)**
```json
{
  "date": "2022-04-03",
  "description": "WAL-MART #3311 SE2 US 840", 
  "amount": 67.16,
  "type": "pago",        // ← CORRECTO: tipo "DEV" = devolución = crédito
  "group": "pagos"
}
```

## 🔍 **Análisis de la Imagen del Estado de Cuenta**

### **Sección: SUBTOTAL PAGOS/CREDITOS**
1. **SALDO ANTERIOR**: 378.64 (tipo "ajuste")
2. **AMERICAN AIRLINE**: 126.24 (tipo "cargo" - consumo)
3. **WAL-MART DEV**: 67.16 (tipo "pago" - devolución) ← **CRÍTICO**
4. **SU PAGO**: -378.64 (tipo "pago" - pago)

### **Sección: SUBTOTAL NOTAS DEBITO**
5 transacciones de "CONSUMOS EN EL EXTERIOR" con tipo "N/D" = **todas son tipo "cargo"**

## 🎯 **Resultado Esperado Después de las Mejoras**

### **Transacciones del Primer Grupo (PAGOS/CREDITOS)**
```json
[
  {
    "date": "2022-04-01",
    "description": "SALDO ANTERIOR",
    "amount": 378.64,
    "type": "ajuste",    // ← Balance inicial
    "group": "pagos"
  },
  {
    "date": "2022-01-12", 
    "description": "AMERICAN AIRLINE INC EC 840",
    "amount": 126.24,
    "type": "cargo",     // ← Consumo
    "group": "pagos"
  },
  {
    "date": "2022-04-03",
    "description": "WAL-MART #3311 SE2 US 840", 
    "amount": 67.16,
    "type": "pago",      // ← DEVOLUCIÓN (crédito)
    "group": "pagos"
  },
  {
    "date": "2022-04-18",
    "description": "*** SU PAGO - MUCHAS GRACIAS ***",
    "amount": -378.64,
    "type": "pago",      // ← PAGO (crédito)
    "group": "pagos"
  }
]
```

## 🚀 **Beneficios de la Mejora**

### **1. Interpretación Correcta de Devoluciones**
- ✅ **WAL-MART DEV**: Se reconoce como crédito (reduce deuda)
- ✅ **Tipos de operación**: Se respetan los códigos del banco
- ✅ **Columnas de signo**: Se consideran como indicadores claros

### **2. Cálculos Correctos**
- ✅ **Total de pagos**: 572.04 (incluye devoluciones)
- ✅ **Balance**: Se calcula correctamente
- ✅ **Categorización**: Cada transacción tiene el tipo correcto

### **3. Consistencia con el Estado de Cuenta**
- ✅ **Secciones agrupadas**: Se respetan los subtotales
- ✅ **Tipos de operación**: Se interpretan según estándares bancarios
- ✅ **Signos**: Se consideran las columnas +/- del banco

## 🔧 **Verificación**

Para verificar que las mejoras funcionan:

1. **Subir el mismo PDF** después de las actualizaciones
2. **Verificar en la consola** que aparezcan los logs de debugging
3. **Confirmar** que la transacción WAL-MART DEV tenga:
   - `type: "pago"` (no "cargo")
   - `group: "pagos"`
   - Se reconozca como crédito (reduce deuda)
4. **Verificar** que todas las transacciones tengan el tipo correcto según su tipo de operación

## 📝 **Notas Importantes**

- **La prioridad es**: Tipo de Operación > Columnas de Signo > Monto
- **Las devoluciones (DEV)** siempre son créditos, aunque el monto sea positivo
- **Las notas de débito (N/D)** siempre son débitos, aunque el monto sea pequeño
- **Los signos +/-** son indicadores claros del tipo de transacción
- **El monto** es orientativo pero no definitivo para determinar el tipo
