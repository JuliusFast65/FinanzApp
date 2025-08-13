# 🔧 Instrucciones Críticas Implementadas para OpenAI y Gemini

## 🎯 **Objetivo**
Este documento resume todas las **instrucciones críticas** que hemos implementado para **ambas IAs** (OpenAI y Gemini) para asegurar un comportamiento consistente y correcto en la extracción de estados de cuenta.

## 🚀 **Instrucciones Críticas para Campos Principales**

### **1. Campos de Totales (NO calcular sumando transacciones)**
```
INSTRUCCIONES CRÍTICAS PARA CAMPOS PRINCIPALES:
- Para "payments": Usa el SUBTOTAL de la sección "PAGOS/CREDITOS" o "ABONOS" de la cabecera
- Para "charges": Usa el SUBTOTAL de la sección "CONSUMOS DEL PERIODO" o "CARGOS" de la cabecera
- Para "fees": Usa el SUBTOTAL de la sección "NOTAS DE DÉBITO" o "COMISIONES" de la cabecera
- NO calcules estos valores sumando transacciones individuales
- Usa los TOTALES que aparecen en los resúmenes de cabecera
```

### **2. Campos de Información General**
```
{
  "totalBalance": número_decimal (saldo total actual, puede ser 0),
  "minimumPayment": número_decimal (pago mínimo requerido),
  "dueDate": "YYYY-MM-DD" (fecha de vencimiento del pago),
  "creditLimit": número_decimal (límite de crédito total),
  "availableCredit": número_decimal (crédito disponible),
  "previousBalance": número_decimal (saldo del periodo anterior),
  "payments": número_decimal (pagos realizados en el periodo),
  "charges": número_decimal (nuevos cargos del periodo),
  "fees": número_decimal (comisiones cobradas),
  "interest": número_decimal (intereses cobrados),
  "bankName": "nombre_del_banco",
  "cardHolderName": "nombre_completo_tarjetahabiente",
  "lastFourDigits": "1234" (últimos 4 dígitos),
  "statementDate": "YYYY-MM-DD" (fecha del estado de cuenta)
}
```

## 🔍 **Instrucciones Críticas para Transacciones**

### **1. Secciones Agrupadas (NO omitir transacciones)**
```
INSTRUCCIONES CRÍTICAS PARA TRANSACCIONES:
- Los estados de cuenta suelen tener SECCIONES AGRUPADAS con subtotales
- PRIMER GRUPO: "PAGOS/CREDITOS" o "SALDO ANTERIOR" al inicio
- SEGUNDO GRUPO: Comisiones, intereses, notas de débito
- TERCER GRUPO: Consumos/compras del período
- DEBES extraer TODAS las transacciones de TODAS las secciones agrupadas
- NO omitas transacciones por estar en resúmenes o subtotales
- Busca en TODA la página, especialmente en las secciones superiores
- Revisa también secciones de "MOVIMIENTOS DEL PERIODO" o "DETALLE DE MOVIMIENTOS"
```

### **2. Estructura de Transacciones**
```
"transactions": [
  {
    "date": "YYYY-MM-DD",
    "description": "descripción_transacción",
    "amount": número_decimal,
    "type": "cargo|pago|ajuste",
    "group": "pagos|comisiones|intereses|tarjeta_adicional|compras|general"
  }
]
```

## 💳 **Interpretación Crítica de Tipos de Operación**

### **1. Tipos de Operación Bancarios**
```
INTERPRETACIÓN CRÍTICA DE TIPOS DE OPERACIÓN:
- **"DEV"** = DEVOLUCIÓN = tipo "pago" (crédito que reduce deuda)
- **"CV"** = CRÉDITO = tipo "pago" (crédito que reduce deuda)
- **"PAGO"** = PAGO = tipo "pago" (crédito que reduce deuda)
- **"N/D"** = NOTA DE DÉBITO = tipo "cargo" (débito que aumenta deuda)
- **"CONS."** = CONSUMO = tipo "cargo" (débito que aumenta deuda)
- **"SALDO ANTERIOR"** = tipo "ajuste" (balance inicial)
```

### **2. Prioridad de Interpretación**
```
IMPORTANTE: El tipo de transacción debe basarse en:
1. **PRIMERO**: El TIPO DE OPERACIÓN (DEV, CV, PAGO, N/D, CONS.)
2. **SEGUNDO**: Las columnas de SIGNO (+/-, D/C, +, -)
3. **TERCERO**: El monto (negativo = crédito, positivo = débito, pero no siempre)

- Una transacción con tipo "DEV" siempre es un crédito, aunque el monto sea positivo
- Una transacción con tipo "N/D" siempre es un débito, aunque el monto sea pequeño
- Una transacción con signo "+" siempre es un débito, aunque el tipo de operación sea ambiguo
- Una transacción con signo "-" siempre es un crédito, aunque el tipo de operación sea ambiguo
```

## ➕➖ **Interpretación Crítica de Columnas de Signo**

### **1. Columna "+/-"**
```
INTERPRETACIÓN CRÍTICA DE COLUMNAS DE SIGNO:
- **Columna "+/-"**: 
  - **"+"** = DÉBITO (aumenta deuda) = tipo "cargo"
  - **"-"** = CRÉDITO (reduce deuda) = tipo "pago"
  - **Vacía** = Revisar tipo de operación o descripción
```

### **2. Columna "SIGNO" o "INDICADOR"**
```
- **Columna "SIGNO"** o "INDICADOR":
  - **"D"** = DÉBITO = tipo "cargo"
  - **"C"** = CRÉDITO = tipo "pago"
  - **"+"** = DÉBITO = tipo "cargo"
  - **"-"** = CRÉDITO = tipo "pago"
```

## 🔍 **Patrones Específicos a Buscar**

### **1. Transacciones de Saldo y Balance**
```
PATRONES ESPECÍFICOS A BUSCAR EN TRANSACCIONES:
- "SALDO ANTERIOR" o "BALANCE ANTERIOR" (es una transacción)
- "PAGOS/CREDITOS" o "ABONOS" (extrae cada transacción individual)
- "NOTAS DE DÉBITO" o "COMISIONES" (extrae cada cargo individual)
- "CONSUMOS DEL PERIODO" o "MOVIMIENTOS" (extrae cada compra individual)
- Transacciones con tipos como "CV", "DEV", "PAGO", "N/D", "CONS."
```

### **2. Secciones de Movimientos**
```
- Revisa también secciones de "MOVIMIENTOS DEL PERIODO" o "DETALLE DE MOVIMIENTOS"
- Si hay un subtotal de grupo, extrae también las transacciones individuales que lo componen
```

## 📋 **Formato y Validación**

### **1. Formato JSON Estricto**
```
Devuelve SOLO el JSON, sin texto adicional
Si un campo no está visible, usa null
Para montos usa números decimales (ej: 1234.56, no "$1,234.56")
Para fechas usa formato YYYY-MM-DD
Los montos negativos indican pagos/créditos
Lee cuidadosamente todos los números y fechas
Busca información en toda la página, no solo en el resumen
```

### **2. Validación de Datos**
```
- NO calcules totales sumando transacciones individuales
- Usa los TOTALES que aparecen en los resúmenes de cabecera
- NO omitas transacciones por estar en resúmenes o subtotales
- Busca en TODA la página, especialmente en las secciones superiores
```

## 🔧 **Implementación Técnica**

### **1. Prompts Sincronizados**
- ✅ **OpenAI**: Prompt principal y de transacciones con instrucciones críticas
- ✅ **Gemini**: Prompt principal y de transacciones con instrucciones críticas
- ✅ **Consistencia**: Ambos usan exactamente las mismas instrucciones

### **2. Logs de Debugging**
- ✅ **Análisis de páginas**: Logs detallados del flujo de imágenes
- ✅ **Respuestas de IA**: Logs de contenido y estructura de respuesta
- ✅ **Resultados de parsing**: Logs de datos extraídos y estructura
- ✅ **Verificación de integridad**: Estado completo del objeto analysis

### **3. Manejo de Errores**
- ✅ **Categorización no bloqueante**: Continúa si falla la IA
- ✅ **Preservación de transacciones**: Nunca se pierden por errores
- ✅ **Fallback automático**: Categoría "other" si falla la categorización

## 📊 **Resultado Esperado**

### **1. Campos Principales Correctos**
```
{
  "payments": 572.04,    // ← SUBTOTAL PAGOS/CREDITOS (NO suma de transacciones)
  "charges": 1723.30,    // ← SUBTOTAL CONSUMOS PERIODO (NO suma de transacciones)
  "fees": 9.50,          // ← SUBTOTAL NOTAS DEBITO (NO suma de transacciones)
  "transactions": 22     // ← TODAS las transacciones de TODOS los grupos
}
```

### **2. Transacciones Completas**
- ✅ **4 transacciones** del primer grupo (pagos/créditos)
- ✅ **5 transacciones** del segundo grupo (notas de débito)
- ✅ **13 transacciones** del tercer grupo (consumos)
- ✅ **TOTAL: 22 transacciones**

### **3. Tipos Correctos**
- ✅ **WAL-MART DEV**: tipo "pago" (devolución = crédito)
- ✅ **SALDO ANTERIOR**: tipo "ajuste" (no se suma a cargos)
- ✅ **Comisiones N/D**: tipo "cargo" (notas de débito)
- ✅ **Consumos**: tipo "cargo" (gastos del período)

## 🔍 **Verificación**

Para verificar que ambas IAs funcionan correctamente:

1. **Subir el mismo PDF** después de las actualizaciones
2. **Revisar la consola** para los logs de debugging
3. **Confirmar** que aparecen las instrucciones críticas en los prompts
4. **Verificar** que ambas IAs extraen 22 transacciones
5. **Confirmar** que los tipos de transacción son correctos
6. **Verificar** que los campos principales usan subtotales de cabecera

## 📝 **Notas Importantes**

- **Consistencia total**: OpenAI y Gemini usan exactamente las mismas instrucciones
- **Instrucciones críticas**: Se enfatizan con **MAYÚSCULAS** y **negritas**
- **Prioridades claras**: Tipo de operación > Columnas de signo > Monto
- **Patrones específicos**: Se buscan secciones agrupadas y transacciones individuales
- **Validación robusta**: Se verifica la integridad en cada paso del proceso

## 🎯 **Objetivo Final**

Asegurar que **ambas IAs** (OpenAI y Gemini):
1. ✅ **Extraigan todas las transacciones** de todas las secciones agrupadas
2. ✅ **Interpreten correctamente** los tipos de operación bancarios
3. ✅ **Usen subtotales de cabecera** para campos principales
4. ✅ **Manejen correctamente** las columnas de signo
5. ✅ **Devuelvan datos consistentes** independientemente de la IA seleccionada
