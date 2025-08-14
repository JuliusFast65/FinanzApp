# Contexto del Proyecto: FinanzApp - Control Total de tus Finanzas

## 📋 Información General

**Nombre del Proyecto:** FinanzApp - Control Total de tus Finanzas  
**Versión:** 1.0.0  
**Tecnologías:** React 19, Vite, Firebase, Tailwind CSS, Recharts  
**Tipo:** PWA (Progressive Web App) para gestión financiera personal

## 🎯 Propósito

Aplicación de finanzas personales moderna y segura que permite a los usuarios:
- Gestionar tarjetas de crédito con encriptación de datos sensibles
- Cargar y analizar automáticamente estados de cuenta en PDF
- Visualizar métricas financieras en tiempo real
- Rastrear saldos, límites y utilización de crédito
- Analizar patrones de gastos y transacciones

## 🏗️ Arquitectura del Proyecto

### Estructura de Directorios
```
finanzapp/
├── src/
│   ├── components/          # Componentes React principales
│   ├── hooks/              # Custom hooks
│   ├── utils/              # Utilidades (crypto, PDF parsing)
│   ├── firebase/           # Configuración Firebase
│   ├── i18n/               # Internacionalización
│   ├── config/             # Configuración centralizada
│   ├── assets/             # Recursos estáticos
│   ├── App.jsx            # Componente principal
│   └── main.jsx           # Punto de entrada
├── public/                # Archivos estáticos y PWA
├── scripts/               # Scripts de build
└── dist/                  # Build de producción
```

### Tecnologías Principales
- **Frontend:** React 19 + Vite
- **Styling:** Tailwind CSS + Google Fonts
- **Backend:** Firebase (Auth, Firestore)
- **Gráficos:** Recharts para visualizaciones
- **PDFs:** PDF.js + pdf-parse para análisis
- **PWA:** Service Worker + Manifest
- **Encriptación:** Crypto.js para datos sensibles
- **Internacionalización:** i18next para múltiples idiomas

## 🔐 Sistema de Autenticación

- **Proveedor:** Google Auth (Firebase)
- **Almacenamiento:** Firestore con estructura de usuarios
- **Seguridad:** Encriptación de datos sensibles con clave del usuario
- **Autenticación de dos factores:** Implementada para usuarios premium

## 💳 Funcionalidades Principales

### Gestión de Tarjetas de Crédito
- ✅ Agregar, editar y eliminar tarjetas de crédito
- ✅ Encriptación de datos sensibles (números, CVV)
- ✅ Seguimiento de límites, saldos y crédito disponible
- ✅ Fechas de vencimiento y cierre de cuenta
- ✅ Cálculo automático de utilización de crédito
- ✅ Categorización por banco y tipo de tarjeta

### Análisis de Estados de Cuenta
- ✅ Carga y análisis automático de PDFs
- ✅ Extracción inteligente de información financiera
- ✅ Detección de saldos, pagos mínimos y fechas de vencimiento
- ✅ Análisis de transacciones y cargos
- ✅ Categorización automática de transacciones
- ✅ Corrección manual de categorías
- ✅ Almacenamiento seguro en la nube

### Dashboard Financiero
- ✅ Métricas clave en tiempo real
- ✅ Gráficos de utilización por tarjeta
- ✅ Evolución temporal de saldos
- ✅ Distribución por banco
- ✅ Alertas de próximos vencimientos
- ✅ Estadísticas de gastos por categoría

## 📊 Estructura de Datos

### Firestore Collections
```
artifacts/{appId}/
├── users/{userId}/
│   ├── creditCards/{cardId}      # Tarjetas de crédito
│   ├── statements/{statementId}   # Estados de cuenta
│   ├── transactions/{transactionId} # Transacciones
│   ├── profile                    # Perfil del usuario
│   └── security                   # Configuración de seguridad
```

### Tarjeta de Crédito
```javascript
{
  name: "string (encriptado)",
  number: "string (encriptado)",
  cvv: "string (encriptado)",
  expiryDate: "string",
  creditLimit: number,
  currentBalance: number,
  bank: "string",
  closingDate: "string",
  dueDate: "string",
  createdAt: "timestamp",
  updatedAt: "timestamp"
}
```

### Estado de Cuenta
```javascript
{
  fileName: "string",
  uploadDate: "timestamp",
  statementDate: "string",
  cardId: "string",
  openingBalance: number,
  closingBalance: number,
  minimumPayment: number,
  dueDate: "string",
  transactions: ["array"],
  analyzed: boolean,
  categories: ["array"]
}
```

## 🎨 Componentes Principales

### Core Components
- `CreditCardManager` - Gestión completa de tarjetas de crédito
- `PDFStatementAnalyzer` - Análisis automático de PDFs
- `FinanceDashboard` - Dashboard principal con métricas
- `StatementsView` - Vista y gestión de estados de cuenta
- `UserProfile` - Perfil y configuración del usuario

### Security Components
- `SecuritySettings` - Configuración de seguridad
- `AppLock` - Bloqueo de aplicación
- `TwoFactorAuth` - Autenticación de dos factores
- `DeleteConfirmModal` - Confirmaciones de eliminación

### Utility Components
- `InstallPWA` - Instalación de la aplicación
- `LanguageSelector` - Selector de idioma
- `UpdateNotification` - Notificaciones de actualización
- `StatisticsPanel` - Panel de estadísticas avanzadas

## 🔧 Hooks Personalizados

### `useCreditCards`
- Gestión de tarjetas de crédito del usuario
- CRUD de tarjetas con encriptación
- Cálculo de métricas financieras

### `useStatements`
- Gestión de estados de cuenta
- Análisis de PDFs y extracción de datos
- Categorización de transacciones

### `useFirebase`
- Configuración y conexión con Firebase
- Autenticación y gestión de usuarios
- Operaciones de base de datos

## 🔒 Seguridad y Privacidad

- **Encriptación:** Datos sensibles encriptados end-to-end
- **Clave:** Derivada del UID del usuario
- **Almacenamiento:** Solo datos encriptados en Firestore
- **Autenticación:** Google OAuth con Firebase
- **2FA:** Autenticación de dos factores opcional
- **Bloqueo de App:** Protección con PIN o biométricos

## 📱 PWA (Progressive Web App)

### Configuración PWA
La aplicación está configurada como PWA completa para permitir instalación en dispositivos móviles y desktop.

#### Archivos PWA
- **`public/manifest.json`**: Configuración de la app instalable
- **`public/sw.js`**: Service Worker para cache y actualizaciones
- **`index.html`**: Meta tags y registro del Service Worker
- **Iconos**: `pwa-192x192.png`, `pwa-512x512.png`, `favicon.svg`

#### Características PWA
- ✅ **Instalable**: Se puede instalar como app nativa
- ✅ **Offline**: Funcionalidad básica sin conexión
- ✅ **Actualizaciones automáticas**: Service Worker detecta cambios
- ✅ **Cache inteligente**: Recursos cacheados para mejor rendimiento
- ✅ **Notificaciones push**: Preparado para notificaciones (futuro)

#### Criterios de Instalación
Para que el navegador muestre el prompt de instalación, la app debe cumplir:
- ✅ **HTTPS**: Desplegada en Firebase Hosting
- ✅ **Manifest válido**: Con todos los campos requeridos
- ✅ **Service Worker registrado**: En `index.html`
- ✅ **Iconos**: 192x192 y 512x512 píxeles
- ✅ **Meta tags PWA**: Para todos los navegadores
- ✅ **Display standalone**: Se abre como app nativa

#### Sistema de Versiones Centralizado
Para evitar duplicaciones y mantener consistencia, la versión se define en un solo lugar:
- **`src/config/version.js`**: Archivo centralizado con todas las versiones
- **Importación**: Todos los componentes importan `APP_VERSION` desde este archivo
- **Beneficios**: 
  - Una sola fuente de verdad para la versión
  - Fácil actualización (solo cambiar en un lugar)
  - Evita inconsistencias entre archivos

## 🌍 Internacionalización

### Sistema i18n
- **Framework:** i18next + react-i18next
- **Idiomas:** Español (por defecto), Inglés
- **Detección automática:** Detecta el idioma del navegador
- **Cambio manual:** Selector de idioma en el perfil

### Archivos de Traducción
- **`src/i18n/locales/es.json`**: Traducciones en español
- **`src/i18n/locales/en.json`**: Traducciones en inglés
- **Configuración:** `src/i18n/index.js`

## 🚀 Scripts Disponibles

```bash
npm run dev          # Desarrollo
npm run build        # Build de producción
npm run preview      # Preview del build
npm run lint         # Linting
```

## 🔄 Flujo de Trabajo de Desarrollo

### Ciclo de Desarrollo Estándar
Para mantener la consistencia y asegurar despliegues exitosos, seguir este orden:

1. **Desarrollo** → `npm run dev`
2. **Incremento de Versión** → Actualizar `package.json` y `src/config/version.js`
3. **Build** → `npm run build`
4. **Despliegue** → `firebase deploy`
5. **Commit** → `git add . && git commit -m "mensaje"`
6. **Push** → `git push`

### Scripts Automatizados
- **`prebuild`**: Actualiza automáticamente la versión del Service Worker
- **Service Worker**: Se actualiza con cada build
- **Firebase**: Despliega automáticamente a hosting y Firestore

## 🔧 Configuración

### Variables de Entorno Requeridas
```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

### Firebase Configuration
- **Auth:** Google Sign-in
- **Firestore:** Base de datos principal
- **Hosting:** Despliegue en Firebase Hosting

## 📈 Estado Actual del Proyecto

- ✅ Sistema de autenticación completo con Google OAuth
- ✅ Gestión completa de tarjetas de crédito
- ✅ Análisis automático de PDFs de estados de cuenta
- ✅ Dashboard financiero con métricas en tiempo real
- ✅ Sistema de categorización de transacciones
- ✅ PWA completamente funcional
- ✅ Encriptación de datos sensibles
- ✅ Autenticación de dos factores
- ✅ Sistema de internacionalización (español/inglés)
- ✅ Bloqueo de aplicación con PIN
- ✅ Estadísticas avanzadas y gráficos

## 🎨 UI/UX

- **Diseño:** Moderno y profesional con enfoque financiero
- **Tema:** Dark mode por defecto con acentos verdes
- **Fuentes:** Google Fonts optimizadas para legibilidad
- **Responsive:** Mobile-first design con adaptación a desktop
- **Accesibilidad:** Navegación por teclado y lectores de pantalla
- **Gráficos:** Visualizaciones interactivas con Recharts

## 🔄 Flujo de Usuario

1. **Onboarding:** Login con Google y configuración inicial
2. **Gestión de Tarjetas:** Agregar y configurar tarjetas de crédito
3. **Análisis de PDFs:** Cargar estados de cuenta para análisis automático
4. **Revisión y Corrección:** Verificar y corregir categorías de transacciones
5. **Dashboard:** Visualizar métricas y estadísticas financieras
6. **Configuración:** Personalizar seguridad y preferencias

## 📝 Notas de Desarrollo

- El proyecto usa React 19 con las últimas características
- Implementación de PWA con Service Worker
- Sistema de encriptación end-to-end para datos sensibles
- Análisis inteligente de PDFs con extracción de datos
- Arquitectura modular con hooks personalizados
- Soporte completo para modo offline
- Sistema de internacionalización completo

## 🆕 Funcionalidades Recientes

### Sistema de Categorización Inteligente (Diciembre 2024)
Implementación de categorización automática de transacciones con corrección manual:

#### **Características Implementadas:**
- **Categorización Automática:** IA analiza transacciones y asigna categorías
- **Corrección Manual:** Usuarios pueden corregir categorías incorrectas
- **Aprendizaje:** El sistema mejora con cada corrección
- **Categorías Personalizables:** Usuarios pueden crear categorías propias

#### **Componentes Actualizados:**
- **`PDFStatementAnalyzer`:** Análisis automático mejorado
- **`CategoryCorrectionModal`:** Interfaz para corrección de categorías
- **`StatementsView`:** Vista mejorada de estados de cuenta
- **`StatisticsPanel`:** Estadísticas por categoría

### Sistema de Seguridad Avanzado (Diciembre 2024)
Implementación de múltiples capas de seguridad:

#### **Características de Seguridad:**
- **Bloqueo de Aplicación:** PIN personalizable o biométricos
- **Autenticación de Dos Factores:** 2FA opcional para mayor seguridad
- **Encriptación End-to-End:** Datos sensibles protegidos
- **Configuración de Seguridad:** Panel centralizado de opciones

#### **Componentes de Seguridad:**
- **`AppLock`:** Sistema de bloqueo con PIN
- **`TwoFactorAuth`:** Configuración de 2FA
- **`SecuritySettings`:** Panel de configuración de seguridad
- **`UserProfile`:** Gestión de perfil y seguridad

---

**Última actualización:** Diciembre 2024  
**Versión del documento:** 2.0  
**Proyecto:** FinanzApp - Control Total de tus Finanzas 