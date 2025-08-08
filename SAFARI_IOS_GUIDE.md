# 📱 Guía de Instalación para Safari iOS

## ¿Por qué Safari iOS es diferente?

Safari en iOS tiene un comportamiento único para las PWAs:

- ❌ **No muestra prompts automáticos** de instalación como Chrome/Edge
- ✅ **Requiere instalación manual** usando la función "Compartir"
- ✅ **Funciona perfectamente** una vez instalada

## 🚀 Cómo Instalar en Safari iOS

### Método 1: Banner Automático (Recomendado)
1. **Abrir Safari** en tu iPhone/iPad
2. **Navegar** a tu aplicación Introspect
3. **Esperar 3 segundos** - aparecerá un banner azul en la parte superior
4. **Leer las instrucciones** en el banner
5. **Seguir los pasos**:
   - Tocar botón "Compartir" (cuadrado con flecha)
   - Desplazar hacia abajo
   - Tocar "Agregar a pantalla de inicio"
   - Tocar "Agregar"

### Método 2: Instalación Manual
1. **Abrir Safari** en tu iPhone/iPad
2. **Navegar** a tu aplicación Introspect
3. **Tocar el botón "Compartir"** (cuadrado con flecha arriba)
4. **Desplazar hacia abajo** en el menú
5. **Tocar "Agregar a pantalla de inicio"**
6. **Tocar "Agregar"** para confirmar

## ✅ Verificar la Instalación

### Indicadores de Éxito:
- ✅ La app aparece en la pantalla de inicio
- ✅ Tiene el ícono de Introspect
- ✅ Se abre como una app nativa (sin barra de Safari)
- ✅ Funciona offline

## 🔧 Solución de Problemas

### ❌ No aparece "Agregar a pantalla de inicio"

**Este es el problema más común en Safari iOS.** Safari es muy estricto con los criterios para mostrar la opción de instalación.

**Causas más frecuentes:**
1. **Meta tags faltantes o incorrectos**
2. **Iconos no cargan correctamente**
3. **Página no está completamente cargada**
4. **Problemas de caché**
5. **No está en HTTPS**

**Solución paso a paso:**
1. **Visita `/safari-test.html`** - Esta página verifica específicamente los criterios de iOS
2. **Asegúrate de que todos los tests pasen** - Especialmente los meta tags de Apple
3. **Recarga completamente** - Toca el botón de recarga y espera 10 segundos
4. **Limpia datos de Safari** - Configuración > Safari > Avanzado > Datos de sitios web
5. **Verifica HTTPS** - La URL debe comenzar con `https://`
6. **Prueba en modo incógnito** - Para descartar problemas de caché
7. **Busca en "Más"** - Si no aparece la opción, toca "Más" en el menú compartir y activa "Agregar a pantalla de inicio"
**Soluciones:**
1. **Verificar la página de diagnóstico**: Ve a `/safari-test.html` para verificar todos los criterios específicos de iOS
2. **Recargar la página completamente**: Toca el botón de recarga y espera 10 segundos
3. **Limpiar datos de Safari**: Configuración > Safari > Avanzado > Datos de sitios web
4. **Verificar HTTPS**: Asegúrate de que la URL comience con `https://`
5. **Probar en modo incógnito**: Para descartar problemas de caché
6. **Tocar "Más" en el menú compartir**: Si no aparece la opción, toca "Más" y activa "Agregar a pantalla de inicio"

### ❌ El ícono no se muestra correctamente
**Soluciones:**
1. **Verificar iconos**: Los archivos deben existir:
   - `/apple-icon-180.png`
   - `/manifest-icon-192.maskable.png`
   - `/manifest-icon-512.maskable.png`

## 🎯 Características Específicas de iOS

### Meta Tags Implementados:
```html
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Introspect" />
<meta name="apple-touch-fullscreen" content="yes" />
<meta name="apple-mobile-web-app-orientations" content="portrait" />
```

### Comportamiento:
- **Modo standalone**: Se abre como app nativa
- **Barra de estado**: Personalizada con tema oscuro
- **Orientación**: Bloqueada en portrait
- **Pantalla completa**: Sin elementos de Safari

## 📱 Diferencias con Otros Navegadores

| Característica | Chrome/Edge | Safari iOS |
|----------------|-------------|------------|
| Prompt automático | ✅ Sí | ❌ No |
| Instalación manual | ✅ Sí | ✅ Sí |
| Banner personalizado | ✅ Sí | ✅ Sí |
| Modo standalone | ✅ Sí | ✅ Sí |

## 🚀 Ventajas de la PWA en iOS

### Una vez instalada:
- ✅ **Funciona como app nativa**
- ✅ **Acceso rápido** desde pantalla de inicio
- ✅ **Funciona offline**
- ✅ **Sin barra de Safari**
- ✅ **Actualizaciones automáticas**

---

**Nota importante**: Safari iOS requiere instalación manual, pero una vez instalada, la experiencia es idéntica a una app nativa.

**Última actualización:** Diciembre 2024  
**Versión:** 1.72.0 