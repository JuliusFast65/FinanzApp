# 🔍 Guía de Debugging para Transacciones Perdidas

## Problema Identificado
El usuario reporta que la IA "considera" transacciones del primer grupo (pagos) pero no las muestra en la lista renderizada. Esto sugiere que las transacciones se están perdiendo en algún punto del pipeline.

## 🔍 Puntos de Verificación en la Consola

### 1. **Análisis de Página Principal**
```
🔍 [DEBUG] === ANÁLISIS DE PÁGINA PRINCIPAL ===
```
- Verificar que la IA está devolviendo transacciones del primer grupo
- Contar cuántas transacciones se extraen inicialmente

### 2. **Análisis de Páginas Adicionales**
```
🔍 [DEBUG] === TRANSACCIONES PÁGINA X ===
```
- Verificar que las páginas adicionales también extraen transacciones
- Contar transacciones de cada página

### 3. **Combinación de Transacciones**
```
🔍 [DEBUG] === DESPUÉS DE COMBINAR ===
```
- Verificar que todas las transacciones se combinen correctamente
- Contar el total después de combinar

### 4. **Deduplicación**
```
🔍 [DEBUG] === DESPUÉS DE DEDUPLICAR ===
```
- Verificar que no se pierdan transacciones durante la deduplicación
- Comparar cantidad antes y después

### 5. **Categorización**
```
🔍 [DEBUG] === ANTES DE CATEGORIZAR ===
🔍 [DEBUG] === DESPUÉS DE CATEGORIZAR ===
```
- Verificar que las transacciones se mantengan durante la categorización
- Contar transacciones antes y después

### 6. **Resultado Final del Análisis**
```
🔍 [DEBUG] === RESULTADO FINAL DEL ANÁLISIS ===
```
- Verificar el estado final de las transacciones
- Contar el total final

### 7. **Enriquecimiento**
```
🔍 [DEBUG] === ENRIQUECIMIENTO - RESULTADO ORIGINAL ===
🔍 [DEBUG] === ENRIQUECIMIENTO - RESULTADO FINAL ===
```
- Verificar que no se pierdan transacciones durante el enriquecimiento
- Comparar cantidad antes y después

### 8. **Guardado**
```
🔍 [DEBUG] === GUARDADO - TRANSACCIONES RECIBIDAS ===
🔍 [DEBUG] === GUARDADO - ANTES DE ENCRIPTAR ===
🔍 [DEBUG] === GUARDADO - DESPUÉS DE ENCRIPTAR ===
🔍 [DEBUG] === GUARDADO - DATOS FINALES ===
```
- Verificar que las transacciones se mantengan durante el guardado
- Contar en cada paso del proceso de guardado

### 9. **Carga y Desencriptado**
```
🔍 [DEBUG] === STATEMENT X - ANTES DE DESENCRIPTAR ===
🔍 [DEBUG] === STATEMENT X - DESPUÉS DE DESENCRIPTAR ===
🔍 [DEBUG] === STATEMENT X - ANTES DE AGREGAR AL ARRAY ===
```
- Verificar que las transacciones se mantengan durante la carga
- Contar antes y después del desencriptado

### 10. **Resumen Final**
```
🔍 [DEBUG] === RESUMEN FINAL DE STATEMENTS CARGADOS ===
```
- Verificar el estado final de todos los statements
- Contar transacciones en cada statement

## 🚨 Señales de Alerta

### **Transacciones que Desaparecen**
- Si hay transacciones en "ANÁLISIS DE PÁGINA PRINCIPAL" pero no en "RESULTADO FINAL"
- Si hay transacciones en "DESPUÉS DE COMBINAR" pero no en "DESPUÉS DE DEDUPLICAR"
- Si hay transacciones en "ANTES DE CATEGORIZAR" pero no en "DESPUÉS DE CATEGORIZAR"

### **Cambios en Cantidades**
- Disminución inesperada en el número de transacciones entre pasos
- Transacciones que aparecen como 0 o undefined

### **Errores de Parsing**
- Mensajes de error en el parsing de JSON
- Transacciones con campos faltantes o inválidos

## 🔧 Pasos de Diagnóstico

### **Paso 1: Verificar Extracción de IA**
1. Abrir la consola del navegador
2. Subir un PDF con transacciones agrupadas
3. Buscar los logs de "ANÁLISIS DE PÁGINA PRINCIPAL"
4. Contar cuántas transacciones se extraen inicialmente

### **Paso 2: Verificar Combinación**
1. Buscar los logs de "DESPUÉS DE COMBINAR"
2. Verificar que todas las transacciones de todas las páginas estén presentes
3. Contar el total combinado

### **Paso 3: Verificar Deduplicación**
1. Buscar los logs de "DESPUÉS DE DEDUPLICAR"
2. Verificar que no se pierdan transacciones válidas
3. Comparar con el total combinado

### **Paso 4: Verificar Categorización**
1. Buscar los logs de "ANTES DE CATEGORIZAR" y "DESPUÉS DE CATEGORIZAR"
2. Verificar que el número de transacciones se mantenga
3. Identificar si hay transacciones que se pierden durante la categorización

### **Paso 5: Verificar Guardado**
1. Buscar los logs de "GUARDADO - TRANSACCIONES RECIBIDAS"
2. Verificar que las transacciones lleguen al proceso de guardado
3. Contar en cada paso del guardado

### **Paso 6: Verificar Carga**
1. Buscar los logs de "STATEMENT X - ANTES DE DESENCRIPTAR"
2. Verificar que las transacciones se carguen desde la base de datos
3. Contar antes y después del desencriptado

## 📊 Ejemplo de Logs Esperados

### **Análisis Exitoso**
```
🔍 [DEBUG] === ANÁLISIS DE PÁGINA PRINCIPAL ===
🔍 [DEBUG] Cantidad de transacciones: 15
🔍 [DEBUG] Detalle de transacciones de la primera página:
  1. [pagos] PAGO TARJETA CREDITO... | -5000.00 | pago
  2. [pagos] ABONO CUENTA CORRIENTE... | -2500.00 | pago
  3. [comisiones] COMISION ANUALIDAD... | 150.00 | cargo
  ...

🔍 [DEBUG] === RESULTADO FINAL DEL ANÁLISIS ===
🔍 [DEBUG] Total de transacciones finales: 15
```

### **Problema Detectado**
```
🔍 [DEBUG] === ANÁLISIS DE PÁGINA PRINCIPAL ===
🔍 [DEBUG] Cantidad de transacciones: 15
  ...
🔍 [DEBUG] === RESULTADO FINAL DEL ANÁLISIS ===
🔍 [DEBUG] Total de transacciones finales: 8  ← ⚠️ PROBLEMA: Se perdieron 7 transacciones
```

## 🎯 Próximos Pasos

1. **Ejecutar el análisis** con un PDF que tenga transacciones agrupadas
2. **Revisar todos los logs** en la consola siguiendo esta guía
3. **Identificar el punto exacto** donde se pierden las transacciones
4. **Reportar los logs específicos** donde se detecte la pérdida
5. **Proporcionar capturas de pantalla** de los logs problemáticos

## 📝 Información a Proporcionar

Cuando reportes el problema, incluye:

1. **Logs completos** de la consola durante el análisis
2. **Capturas de pantalla** de los logs donde se detecte la pérdida
3. **Descripción del PDF** (número de páginas, tipo de agrupación)
4. **Transacciones esperadas** vs. **transacciones obtenidas**
5. **Paso específico** donde se pierden las transacciones

Esta información nos permitirá identificar exactamente dónde se están perdiendo las transacciones y implementar la solución correcta.
