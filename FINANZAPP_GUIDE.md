# FinanzApp - Guía Completa

## 🎯 ¿Qué es FinanzApp?

FinanzApp es una aplicación web progresiva (PWA) diseñada para el control total de tus finanzas personales, especialmente enfocada en la gestión de tarjetas de crédito y el análisis automático de estados de cuenta.

## ✨ Características Principales

### 💳 Gestión de Tarjetas de Crédito
- **Agregar tarjetas**: Registra todas tus tarjetas de crédito con información completa
- **Editar información**: Actualiza límites, saldos y fechas de vencimiento
- **Eliminar tarjetas**: Gestiona tu cartera de tarjetas fácilmente
- **Encriptación**: Todos los datos sensibles están protegidos con encriptación

### 📄 Análisis Automático de PDFs
- **Carga de archivos**: Sube estados de cuenta en formato PDF
- **Extracción inteligente**: Detecta automáticamente información clave:
  - Saldo total
  - Pago mínimo
  - Fecha de vencimiento
  - Límite de crédito
  - Transacciones
- **Almacenamiento seguro**: Los datos se guardan de forma encriptada

### 📊 Dashboard Financiero
- **Métricas en tiempo real**: Visualiza tu salud financiera actual
- **Gráficos interactivos**: Utilización por tarjeta y evolución temporal
- **Distribución por banco**: Análisis de exposición por institución financiera
- **Alertas de vencimiento**: No te pierdas ningún pago

## 🚀 Primeros Pasos

### 1. Configuración Inicial

1. **Clona el repositorio**:
   ```bash
   git clone [URL_DEL_REPO]
   cd finanzapp
   ```

2. **Instala las dependencias**:
   ```bash
   npm install
   ```

3. **Configura Firebase**:
   - Crea un proyecto en [Firebase Console](https://console.firebase.google.com)
   - Habilita Authentication con Google Sign-in
   - Crea una base de datos Firestore
   - Copia las credenciales

4. **Configura las variables de entorno**:
   ```bash
   cp env.example .env
   # Edita .env con tus credenciales de Firebase
   ```

5. **Ejecuta la aplicación**:
   ```bash
   npm run dev
   ```

### 2. Configuración de Firebase

#### Authentication
1. Ve a Firebase Console > Authentication
2. Habilita Google como proveedor de autenticación
3. Configura el dominio autorizado

#### Firestore Database
1. Crea una base de datos en modo de prueba
2. Configura las reglas de seguridad:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /artifacts/{appId}/users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## 📱 Uso de la Aplicación

### Dashboard Principal
El dashboard te muestra:
- **Límite total**: Suma de todos tus límites de crédito
- **Saldo total**: Deuda actual en todas las tarjetas
- **Crédito disponible**: Límite menos saldo actual
- **Utilización**: Porcentaje de uso del crédito total

### Gestión de Tarjetas
1. **Agregar tarjeta**:
   - Haz clic en "Agregar Tarjeta"
   - Completa la información requerida
   - Los datos se encriptan automáticamente

2. **Editar tarjeta**:
   - Haz clic en "Editar" en la tarjeta deseada
   - Modifica la información necesaria
   - Guarda los cambios

3. **Eliminar tarjeta**:
   - Haz clic en "Eliminar"
   - Confirma la acción

### Análisis de PDFs
1. **Selecciona una tarjeta** del menú desplegable
2. **Sube el archivo PDF** del estado de cuenta
3. **Espera el análisis** automático
4. **Revisa los resultados** extraídos

**Información que se extrae automáticamente**:
- Saldo total
- Pago mínimo
- Fecha de vencimiento
- Límite de crédito
- Saldo anterior
- Pagos realizados
- Cargos nuevos
- Transacciones recientes

## 🔐 Seguridad

### Encriptación de Datos
- Todos los datos sensibles se encriptan antes de guardarse
- La clave de encriptación se deriva del UID del usuario
- Los datos nunca se almacenan en texto plano

### Autenticación
- Inicio de sesión seguro con Google OAuth
- Sesiones persistentes con renovación automática
- Cierre de sesión seguro

### Privacidad
- Los datos son privados y solo accesibles por el usuario
- No se comparten datos con terceros
- Cumplimiento con estándares de seguridad

## 📊 Interpretación de Métricas

### Utilización de Crédito
- **< 30%**: Excelente - Bajo riesgo
- **30-70%**: Moderado - Mantener bajo control
- **> 70%**: Alto - Considerar reducir deuda

### Próximos Vencimientos
- **Rojo**: Vence en menos de 7 días
- **Amarillo**: Vence en 7-15 días
- **Verde**: Vence en más de 15 días

## 🛠️ Desarrollo

### Estructura del Proyecto
```
src/
├── components/
│   ├── CreditCardManager.jsx      # Gestión de tarjetas
│   ├── PDFStatementAnalyzer.jsx   # Análisis de PDFs
│   ├── FinanceDashboard.jsx       # Dashboard principal
│   └── ...                        # Otros componentes
├── hooks/                         # Custom hooks
├── utils/                         # Utilidades
├── firebase/                      # Configuración Firebase
└── i18n/                         # Internacionalización
```

### Tecnologías Utilizadas
- **Frontend**: React 19 + Vite
- **Styling**: Tailwind CSS
- **Backend**: Firebase (Auth, Firestore)
- **Gráficos**: Recharts
- **PDFs**: PDF.js + pdf-parse
- **Encriptación**: Crypto.js

### Scripts Disponibles
```bash
npm run dev          # Desarrollo
npm run build        # Build de producción
npm run preview      # Preview del build
npm run lint         # Linting
```

## 🔮 Próximas Características

### Funcionalidades Planificadas
- [ ] Seguimiento de inversiones
- [ ] Análisis de gastos por categoría
- [ ] Alertas y notificaciones push
- [ ] Exportación de reportes
- [ ] Integración con APIs bancarias
- [ ] Análisis de tendencias
- [ ] Metas financieras
- [ ] Presupuestos mensuales

### Mejoras Técnicas
- [ ] Optimización de rendimiento
- [ ] Mejora en el análisis de PDFs
- [ ] Soporte para más formatos de archivo
- [ ] Sincronización offline
- [ ] Backup automático

## 🆘 Solución de Problemas

### Problemas Comunes

#### Error de Autenticación
- Verifica que Google Sign-in esté habilitado en Firebase
- Asegúrate de que el dominio esté autorizado

#### Error al Cargar PDFs
- Verifica que el archivo sea un PDF válido
- Asegúrate de que el PDF no esté protegido con contraseña
- El archivo debe ser legible (no escaneado como imagen)

#### Datos No Se Guardan
- Verifica la conexión a internet
- Revisa las reglas de Firestore
- Asegúrate de estar autenticado

#### Gráficos No Se Muestran
- Verifica que tengas datos para mostrar
- Revisa la consola del navegador para errores
- Asegúrate de que Recharts esté instalado

### Contacto y Soporte
- Abre un issue en GitHub
- Revisa la documentación técnica
- Contacta al equipo de desarrollo

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Ver el archivo `LICENSE` para más detalles.

---

**FinanzApp - Control Total de tus Finanzas** 💚
