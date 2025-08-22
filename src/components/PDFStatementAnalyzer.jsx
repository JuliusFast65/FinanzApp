import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { collection, addDoc, doc, updateDoc, getDocs } from 'firebase/firestore';
import { encryptText, decryptText } from '../utils/crypto';
import { categorizeTransactions, TRANSACTION_CATEGORIES } from '../utils/transactionCategories';
import { loadUserCategoryPatterns } from '../utils/userCategoryPatterns';
import { validateStatement, formatValidationResult, getConfidenceScore } from '../utils/statementValidator';
import { parseAIResponse, parseStatementResponse, parseTransactionsResponse, logParsingError } from '../utils/jsonParser';
import { findExactCardMatch, generateCardSuggestions, isSafeToAutoCreate, hasSufficientDataForCardCreation } from '../utils/cardMatcher';
import { useUserSettings } from '../utils/userSettings';
import CategoryCorrectionModal from './CategoryCorrectionModal';
import CardCreationModal from './CardCreationModal';
import * as pdfjsLib from 'pdfjs-dist';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { extractTextFromPDF, analyzeStatementText } from '../utils/pdfUtils';

// Configurar el worker de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';


// Ejemplo de función para análisis simple
const handleSimplePDFAnalysis = async (file) => {
  setIsAnalyzing(true);
  setAnalysisResult(null);
  try {
    const text = await extractTextFromPDF(file);
    setExtractedText(text);
    const txs = analyzeStatementText(text);
    setAnalysisResult({ transactions: txs });
  } catch (err) {
    showNotification('error', 'Error', 'No se pudo analizar el PDF.', 5000);
  }
  setIsAnalyzing(false);
};


// Validar y configurar OpenAI
let openai = null;
if (import.meta.env.VITE_OPENAI_API_KEY && import.meta.env.VITE_OPENAI_API_KEY !== 'your_openai_api_key_here') {
    openai = new OpenAI({
        apiKey: import.meta.env.VITE_OPENAI_API_KEY,
        dangerouslyAllowBrowser: true
    });
}

// Validar y configurar Gemini
let genAI = null;
if (import.meta.env.VITE_GEMINI_API_KEY && import.meta.env.VITE_GEMINI_API_KEY !== 'your_gemini_api_key_here') {
    genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
}

const PDFStatementAnalyzer = ({ db, user, appId, onStatementAnalyzed, onNavigateToDashboard }) => {
    const { t } = useTranslation();
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisProgress, setAnalysisProgress] = useState(0);
    const [selectedCard, setSelectedCard] = useState('');
    const [analysisResult, setAnalysisResult] = useState(null);
    const [extractedText, setExtractedText] = useState('');
    const [fileInfo, setFileInfo] = useState(null);
    const [cards, setCards] = useState([]);
    const [isLoadingCards, setIsLoadingCards] = useState(true);
    const [previewImage, setPreviewImage] = useState(null);
    const [selectedAI, setSelectedAI] = useState(null); // Se establecerá basado en la configuración del usuario
    const [userPatterns, setUserPatterns] = useState({});
    const [quotaExceeded, setQuotaExceeded] = useState(false); // Nuevo estado para controlar errores de cuota
    const { settings: userSettings, isLoading: isLoadingSettings } = useUserSettings(db, user, appId);
    
    // Log inicial del componente
    // console.log('🔍 [DEBUG] PDFStatementAnalyzer montado con:', {
    //     db: !!db,
    //     user: !!user,
    //     appId,
    //     userSettings,
    //     isLoadingSettings,
    //     selectedAI
    // });
    const [correctionModal, setCorrectionModal] = useState({
        isOpen: false,
        transaction: null
    });
    const [cardCreationModal, setCardCreationModal] = useState({
        isOpen: false,
        suggestions: null,
        analysisData: null,
        pendingAnalysis: null
    });
    const [validationResult, setValidationResult] = useState(null);
    const [showValidation, setShowValidation] = useState(false);
    const [notification, setNotification] = useState({
        show: false,
        type: 'success', // 'success', 'error', 'info'
        title: '',
        message: ''
    });
    const fileInputRef = useRef(null);

    // Función para validar y corregir datos de análisis
    const validateAndCorrectAnalysisData = (data) => {
        // console.log('🔍 [DEBUG] Validando y corrigiendo datos de análisis...');
        
        if (!data || typeof data !== 'object') {
            console.warn('⚠️ Datos de análisis inválidos, devolviendo datos originales');
            return data;
        }
        
        // Asegurar que las transacciones existan
        if (!data.transactions || !Array.isArray(data.transactions)) {
            console.warn('⚠️ No hay transacciones en los datos, creando array vacío');
            data.transactions = [];
        }
        
        // Corregir cada transacción
        data.transactions = data.transactions.map((transaction, index) => {
            if (!transaction || typeof transaction !== 'object') {
                console.warn(`⚠️ Transacción ${index} inválida, creando transacción por defecto`);
                return {
                    date: null,
                    description: null,
                    amount: null,
                    type: null,
                    cardNumber: null,
                    cardName: null,
                    foreignCurrencyAmount: null,
                    foreignCurrencyCode: null
                };
            }
            
            // Asegurar que todos los campos requeridos existan
            const correctedTransaction = {
                date: transaction.date || null,
                description: transaction.description || null,
                amount: transaction.amount || null,
                type: transaction.type || null,
                cardNumber: transaction.cardNumber || null,
                cardName: transaction.cardName || null,
                foreignCurrencyAmount: transaction.foreignCurrencyAmount || null,
                foreignCurrencyCode: transaction.foreignCurrencyCode || null
            };
            
            // Verificar que NO falte ningún campo crítico
            const requiredFields = ['cardNumber', 'cardName', 'foreignCurrencyAmount', 'foreignCurrencyCode'];
            const missingCriticalFields = requiredFields.filter(field => !transaction.hasOwnProperty(field));
            
            if (missingCriticalFields.length > 0) {
                console.error(`🚨 ERROR CRÍTICO: Transacción ${index} (${transaction.description}) OMITE campos críticos:`, missingCriticalFields);
                // console.error(`   Campos presentes:`, Object.keys(transaction));
                // console.error(`   Campos esperados:`, ['date', 'description', 'amount', 'type', ...requiredFields]);
                
                // Forzar la inclusión de campos faltantes
                missingCriticalFields.forEach(field => {
                    correctedTransaction[field] = null;
                    // console.warn(`   🔧 Campo ${field} forzado a null`);
                });
            }
            
            // Log de campos faltantes
            const missingFields = [];
            if (!transaction.cardNumber) missingFields.push('cardNumber');
            if (!transaction.cardName) missingFields.push('cardName');
            if (!transaction.foreignCurrencyAmount) missingFields.push('foreignCurrencyAmount');
            if (!transaction.foreignCurrencyCode) missingFields.push('foreignCurrencyCode');
            
            // if (missingFields.length > 0) {
            //     console.warn(`⚠️ Transacción ${index} (${transaction.description}) le faltan campos:`, missingFields);
            //     console.warn(`   Campos originales:`, Object.keys(transaction));
            // }
            
            return correctedTransaction;
        });
        
        // console.log(`✅ Datos corregidos: ${data.transactions.length} transacciones procesadas`);
        return data;
    };

    // Función para validar y corregir transacciones por página
    const validateAndCorrectTransactions = (transactions) => {
        // console.log('🔍 [DEBUG] Validando y corrigiendo transacciones por página...');
        
        if (!Array.isArray(transactions)) {
            console.warn('⚠️ Transacciones no es un array, creando array vacío');
            return [];
        }
        
        // Corregir cada transacción
        const correctedTransactions = transactions.map((transaction, index) => {
            if (!transaction || typeof transaction !== 'object') {
                console.warn(`⚠️ Transacción ${index} inválida, creando transacción por defecto`);
                return {
                    date: null,
                    description: null,
                    amount: null,
                    type: null,
                    group: null,
                    cardNumber: null,
                    cardName: null,
                    foreignCurrencyAmount: null,
                    foreignCurrencyCode: null
                };
            }
            
            // Asegurar que todos los campos requeridos existan
            const correctedTransaction = {
                date: transaction.date || null,
                description: transaction.description || null,
                amount: transaction.amount || null,
                type: transaction.type || null,
                group: transaction.group || null,
                cardNumber: transaction.cardNumber || null,
                cardName: transaction.cardName || null,
                foreignCurrencyAmount: transaction.foreignCurrencyAmount || null,
                foreignCurrencyCode: transaction.foreignCurrencyCode || null
            };
            
            // Verificar que NO falte ningún campo crítico
            const requiredFields = ['cardNumber', 'cardName', 'foreignCurrencyAmount', 'foreignCurrencyCode'];
            const missingCriticalFields = requiredFields.filter(field => !transaction.hasOwnProperty(field));
            
            if (missingCriticalFields.length > 0) {
                console.error(`🚨 ERROR CRÍTICO: Transacción ${index} (${transaction.description}) OMITE campos críticos:`, missingCriticalFields);
                // console.error(`   Campos presentes:`, Object.keys(transaction));
                // console.error(`   Campos esperados:`, ['date', 'description', 'amount', 'type', 'group', ...requiredFields]);
                
                // Forzar la inclusión de campos faltantes
                missingCriticalFields.forEach(field => {
                    correctedTransaction[field] = null;
                    // console.warn(`   🔧 Campo ${field} forzado a null`);
                });
            }
            
            // Log de campos faltantes
            const missingFields = [];
            if (!transaction.cardNumber) missingFields.push('cardNumber');
            if (!transaction.cardName) missingFields.push('cardName');
            if (!transaction.foreignCurrencyAmount) missingFields.push('foreignCurrencyAmount');
            if (!transaction.foreignCurrencyCode) missingFields.push('foreignCurrencyCode');
            
            // if (missingFields.length > 0) {
            //     console.warn(`⚠️ Transacción ${index} (${transaction.description}) le faltan campos:`, missingFields);
            //     console.warn(`   Campos originales:`, Object.keys(transaction));
            // }
            
            return correctedTransaction;
        });
        
        // console.log(`✅ Transacciones corregidas: ${correctedTransactions.length} transacciones procesadas`);
        return correctedTransactions;
    };

    // Función para generar instrucciones comunes de análisis
    const generateCommonInstructions = () => {
        console.log('🔍 [DEBUG] Generando instrucciones comunes...');
        const instructions = {
            // Estructura JSON para análisis completo
            completeAnalysisStructure: `{
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
  "statementDate": "YYYY-MM-DD" (fecha del estado de cuenta),
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "descripción_transacción",
      "amount": número_decimal,
      "type": "cargo|pago|ajuste",
      "cardNumber": "número_tarjeta" (número de la tarjeta que realizó la transacción),
      "cardName": "nombre_tarjeta" (nombre del titular de la tarjeta),
      "foreignCurrencyAmount": número_decimal (valor en moneda extranjera, si existe),
      "foreignCurrencyCode": "código_moneda" (USD, EUR, etc., si existe)
    }
  ]
}`,

            // Estructura JSON para transacciones por página
            transactionsStructure: `[
  {
    "date": "YYYY-MM-DD",
    "description": "descripción_transacción",
    "amount": número_decimal,
    "type": "cargo|pago|ajuste",
    "group": "pagos|comisiones|intereses|tarjeta_adicional|compras|general",
    "cardNumber": "número_tarjeta" (número de la tarjeta que realizó la transacción),
    "cardName": "nombre_tarjeta" (nombre del titular de la tarjeta),
    "foreignCurrencyAmount": número_decimal (valor en moneda extranjera, si existe),
    "foreignCurrencyCode": "código_moneda" (USD, EUR, etc., si existe)
  }
]`,

            // Instrucciones críticas para campos principales
            criticalFieldsInstructions: `INSTRUCCIONES CRÍTICAS PARA CAMPOS PRINCIPALES:
- Para "payments": Usa el SUBTOTAL de la sección "PAGOS/CREDITOS" o "ABONOS" de la cabecera
- Para "charges": Usa el SUBTOTAL de la sección "CONSUMOS DEL PERIODO" o "CARGOS" de la cabecera
- Para "fees": Usa el SUBTOTAL de la sección "NOTAS DE DÉBITO" o "COMISIONES" de la cabecera
- NO calcules estos valores sumando transacciones individuales
- Usa los TOTALES que aparecen en los resúmenes de cabecera`,

            // Instrucciones críticas para transacciones
            criticalTransactionsInstructions: `INSTRUCCIONES CRÍTICAS PARA TRANSACCIONES:
- Los estados de cuenta suelen tener SECCIONES AGRUPADAS con subtotales
- PRIMER GRUPO: "PAGOS/CREDITOS" o "SALDO ANTERIOR" al inicio
- SEGUNDO GRUPO: Comisiones, intereses, notas de débito
- TERCER GRUPO: Consumos/compras del período
- DEBES extraer TODAS las transacciones de TODAS las secciones agrupadas
- NO omitas transacciones por estar en resúmenes o subtotales
- Busca en TODA la página, especialmente en las secciones superiores
- Revisa también secciones de "MOVIMIENTOS DEL PERIODO" o "DETALLE DE MOVIMIENTOS"`,

            // Instrucciones para secciones agrupadas (solo transacciones)
            groupedSectionsInstructions: `INSTRUCCIONES CRÍTICAS PARA SECCIONES AGRUPADAS:
- Los estados de cuenta suelen tener SECCIONES AGRUPADAS con subtotales
- PRIMER GRUPO: Generalmente "PAGOS/CREDITOS" o "SALDO ANTERIOR" al inicio
- SEGUNDO GRUPO: Comisiones, intereses, notas de débito
- TERCER GRUPO: Consumos/compras del período
- DEBES extraer TODAS las transacciones de TODAS las secciones agrupadas
- NO omitas transacciones por estar en resúmenes o subtotales
- Busca en TODA la página, especialmente en las secciones superiores
- Revisa también secciones de "MOVIMIENTOS DEL PERIODO" o "DETALLE DE MOVIMIENTOS"
- Si hay un subtotal de grupo, extrae también las transacciones individuales que lo componen`,

            // Interpretación de tipos de operación
            operationTypesInstructions: `INTERPRETACIÓN CRÍTICA DE TIPOS DE OPERACIÓN:
- **"DEV"** = DEVOLUCIÓN = tipo "pago" (crédito que reduce deuda)
- **"CV"** = CRÉDITO = tipo "pago" (crédito que reduce deuda)
- **"PAGO"** = PAGO = tipo "pago" (crédito que reduce deuda)
- **"N/D"** = NOTA DE DÉBITO = tipo "cargo" (débito que aumenta deuda)
- **"CONS."** = CONSUMO = tipo "cargo" (débito que aumenta deuda)
- **"SALDO ANTERIOR"** = tipo "ajuste" (balance inicial)`,

            // Interpretación de columnas de signo
            signColumnsInstructions: `INTERPRETACIÓN CRÍTICA DE COLUMNAS DE SIGNO:
- **Columna "+/-"**: 
  - **"+"** = DÉBITO (aumenta deuda) = tipo "cargo"
  - **"-"** = CRÉDITO (reduce deuda) = tipo "pago"
  - **Vacía** = Revisar tipo de operación o descripción
- **Columna "SIGNO"** o "INDICADOR":
  - **"D"** = DÉBITO = tipo "cargo"
  - **"C"** = CRÉDITO = tipo "pago"
  - **"+"** = DÉBITO = tipo "cargo"
  - **"-"** = CRÉDITO = tipo "pago"`,

            // Lógica de tipos de transacción
            transactionTypeLogic: `IMPORTANTE: El tipo de transacción debe basarse en:
1. **PRIMERO**: El TIPO DE OPERACIÓN (DEV, CV, PAGO, N/D, CONS.)
2. **SEGUNDO**: Las columnas de SIGNO (+/-, D/C, +, -)
3. **TERCERO**: El monto (negativo = crédito, positivo = débito, pero no siempre)

- Una transacción con tipo "DEV" siempre es un crédito, aunque el monto sea positivo
- Una transacción con tipo "N/D" siempre es un débito, aunque el monto sea pequeño
- Una transacción con signo "+" siempre es un débito, aunque el tipo de operación sea ambiguo
- Una transacción con signo "-" siempre es un crédito, aunque el tipo de operación sea ambiguo`,

            // Patrones específicos a buscar
            specificPatterns: `PATRONES ESPECÍFICOS A BUSCAR EN TRANSACCIONES:
- "SALDO ANTERIOR" o "BALANCE ANTERIOR" (es una transacción)
- "PAGOS/CREDITOS" o "ABONOS" (extrae cada transacción individual)
- "NOTAS DE DÉBITO" o "COMISIONES" (extrae cada cargo individual)
- "CONSUMOS DEL PERIODO" o "MOVIMIENTOS" (extrae cada compra individual)
- Transacciones con tipos como "CV", "DEV", "PAGO", "N/D", "CONS."`,

            // Instrucciones para moneda extranjera
            foreignCurrencyInstructions: `INSTRUCCIONES CRÍTICAS PARA MONEDA EXTRANJERA:
- Si una transacción tiene un valor en moneda extranjera, NO uses ese valor como monto principal
- El monto principal debe ser el valor en la moneda local (pesos, soles, etc.)
- El valor en moneda extranjera va en "foreignCurrencyAmount"
- El código de moneda extranjera va en "foreignCurrencyCode" (USD, EUR, GBP, etc.)
- Si no hay moneda extranjera, usa null en ambos campos`,

            // Instrucciones para tarjetas
            cardInstructions: `INSTRUCCIONES CRÍTICAS PARA TARJETAS:
- Cada transacción debe incluir información de la tarjeta que la realizó
- "cardNumber": número completo o últimos dígitos de la tarjeta (principal o adicional)
- "cardName": nombre del titular de la tarjeta (principal o adicional)
- Si no puedes identificar la tarjeta específica, usa null en ambos campos
- Los bancos suelen agrupar transacciones por tarjeta, identifica a qué tarjeta pertenece cada transacción`,

            // Instrucciones para datos no reconocidos
            unrecognizedDataInstructions: `INSTRUCCIONES CRÍTICAS PARA DATOS NO RECONOCIDOS:
- Si NO puedes reconocer claramente algún dato, NO lo inventes ni lo adivines
- Para campos numéricos: usa null si no está visible o es ambiguo
- Para campos de texto: usa null si no está legible o es ambiguo
- Para fechas: usa null si no están claras o son ambiguas
- Para transacciones: si no puedes determinar el tipo, monto o fecha, usa null en esos campos
- Es MEJOR dejar un campo vacío (null) que proporcionar información incorrecta
- Si tienes dudas sobre algún dato, déjalo como null`,

            // Instrucciones para excluir subtotales y totales
            excludeSubtotalsInstructions: `INSTRUCCIONES CRÍTICAS PARA EXCLUIR SUBTOTALES Y TOTALES:
- NO consideres como transacción ninguna línea que contenga las palabras "SUBTOTAL" o "TOTAL"
- Estas líneas son resúmenes de grupo y NO son transacciones individuales
- Si encuentras "SUBTOTAL PAGOS", "TOTAL CONSUMOS", "SUBTOTAL COMISIONES", etc., NO los incluyas
- Solo extrae las transacciones individuales que componen esos subtotales
- Los subtotales y totales son informativos, no transacciones reales`,

            // Instrucciones finales para análisis completo
            finalInstructionsComplete: `Devuelve SOLO el JSON, sin texto adicional
Si un campo no está visible, usa null
Para montos usa números decimales (ej: 1234.56, no "$1,234.56")
Para fechas usa formato YYYY-MM-DD
Los montos negativos indican pagos/créditos
Lee cuidadosamente todos los números y fechas
Busca información en toda la página, no solo en el resumen`,

            // Instrucciones finales para transacciones
            finalInstructionsTransactions: `Devuelve SOLO el array JSON de transacciones, sin texto adicional
Si no hay transacciones en esta página, devuelve un array vacío: []
Para montos usa números decimales (ej: 1234.56)
Las fechas en formato YYYY-MM-DD
Los montos negativos indican pagos/créditos
Busca movimientos, compras, pagos, cargos, etc. de TODOS los grupos`
        };
        
        console.log('🔍 [DEBUG] Instrucciones generadas exitosamente:', Object.keys(instructions));
        return instructions;
    };

    // MOVED: useEffect se movió al final después de definir todas las funciones

    const loadUserPatterns = useCallback(async () => {
        try {
            // console.log('Cargando patrones personalizados del usuario...');
            const patterns = await loadUserCategoryPatterns(db, user.uid, appId);
            setUserPatterns(patterns);
            // console.log('Patrones cargados:', Object.keys(patterns).length);
        } catch (error) {
            console.error('Error cargando patrones del usuario:', error);
        }
    }, [db, user, appId]);

    

    const loadCards = useCallback(async () => {
        try {
            setIsLoadingCards(true);
            // console.log('Cargando tarjetas...');
            
            const cardsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'creditCards');
            const querySnapshot = await getDocs(cardsRef);
            
            // console.log('Documentos encontrados:', querySnapshot.docs.length);
            
            const cardsData = [];
            for (const doc of querySnapshot.docs) {
                const cardData = doc.data();
                // console.log('Procesando tarjeta:', doc.id, cardData);
                
                const decryptedCard = {
                    id: doc.id,
                    name: await decryptText(cardData.name, user.uid),
                    bank: await decryptText(cardData.bank, user.uid),
                    cardNumber: await decryptText(cardData.cardNumber, user.uid),
                    type: cardData.type,
                    limit: cardData.limit,
                    color: cardData.color,
                    createdAt: cardData.createdAt
                };
                
                // console.log('Tarjeta desencriptada:', decryptedCard);
                cardsData.push(decryptedCard);
            }
            
            // console.log('Todas las tarjetas cargadas:', cardsData);
            setCards(cardsData);
            
        } catch (error) {
            console.error('Error al cargar tarjetas:', error);
            showNotification(
                'error',
                '❌ Error al Cargar Tarjetas',
                'No se pudieron cargar las tarjetas. Revisa la consola para más detalles.',
                8000
            );
        } finally {
            setIsLoadingCards(false);
        }
    }, [db, user, appId]);

    const handleCardSelect = (cardId) => {
        // console.log('Seleccionando tarjeta:', cardId);
        // console.log('Tarjetas disponibles:', cards.map(c => ({ id: c.id, name: c.name })));
        setSelectedCard(cardId);
        
        // Verificar que la tarjeta existe
        const foundCard = cards.find(card => card.id === cardId);
        // console.log('Tarjeta encontrada:', foundCard);
        
        if (!foundCard && cardId) {
            console.warn('⚠️ Tarjeta seleccionada no encontrada en la lista de tarjetas');
        }
    };

    // Función para mostrar notificaciones
    const showNotification = (type, title, message, duration = 5000, action = null) => {
        setNotification({
            show: true,
            type,
            title,
            message,
            action
        });

        // Auto-ocultar después del tiempo especificado (solo si no hay acción o es automático)
        if (!action || action.autoHide !== false) {
            setTimeout(() => {
                setNotification(prev => ({ ...prev, show: false }));
            }, duration);
        }
    };

    // Manejar corrección de categoría
    const handleCategoryCorrection = (transaction) => {
        setCorrectionModal({
            isOpen: true,
            transaction
        });
    };

    const handleCorrectionSaved = async (transaction, newCategory) => {
        try {
            // Actualizar la transacción en los resultados locales
            if (analysisResult && analysisResult.transactions) {
                const { TRANSACTION_CATEGORIES } = await import('../utils/transactionCategories');
                
                const updatedTransactions = analysisResult.transactions.map(t => {
                    if (t.description === transaction.description && t.amount === transaction.amount) {
                        return {
                            ...t,
                            category: newCategory,
                            categoryConfidence: 'user',
                            categoryMethod: 'user_pattern',
                            categoryData: TRANSACTION_CATEGORIES[newCategory]
                        };
                    }
                    return t;
                });

                setAnalysisResult({
                    ...analysisResult,
                    transactions: updatedTransactions
                });
            }

            // Recargar patrones del usuario
            await loadUserPatterns();

            // Mostrar notificación de corrección guardada
            showNotification(
                'success',
                '✅ Categoría Corregida',
                `La transacción "${transaction.description}" ahora se categorizará como "${TRANSACTION_CATEGORIES[newCategory]?.name}" en el futuro.`,
                6000
            );

            console.log('Corrección guardada y patrones actualizados');
        } catch (error) {
            console.error('Error procesando corrección:', error);
        }
    };

    // Cargar tarjetas del usuario, patrones personalizados y configuraciones (movido aquí al final)
    useEffect(() => {
        if (db && user && appId) {
            loadCards();
            loadUserPatterns();
        }
    }, [db, user, appId, loadCards, loadUserPatterns]);

    // Aplicar la configuración de IA del usuario cuando se cargue
    useEffect(() => {
        console.log('🔍 [DEBUG] useEffect userSettings ejecutado:', {
            userSettings,
            defaultAI: userSettings?.defaultAI,
            selectedAI,
            isLoadingSettings
        });
        
        if (userSettings?.defaultAI) {
            setSelectedAI(userSettings.defaultAI);
            console.log('✅ IA por defecto del usuario aplicada:', userSettings.defaultAI);
        } else {
            console.log('⚠️ No hay configuración de IA disponible');
        }
    }, [userSettings?.defaultAI]);

    // Monitorear cambios en selectedAI para debug
    useEffect(() => {
        console.log('🔍 [DEBUG] selectedAI cambió a:', selectedAI);
    }, [selectedAI]);

    const handleFileSelect = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (file.type !== 'application/pdf') {
            showNotification(
                'error',
                '📄 Archivo Inválido',
                'Por favor selecciona un archivo PDF válido.',
                5000
            );
            return;
        }

        // Si no hay tarjeta seleccionada, la crearemos automáticamente después del análisis
        if (selectedCard) {
            // Verificar que la tarjeta seleccionada existe en la lista
            const selectedCardData = cards.find(card => card.id === selectedCard);
            if (!selectedCardData) {
                console.error('Tarjeta seleccionada no encontrada:', selectedCard);
                console.error('Tarjetas disponibles:', cards);
                showNotification(
                    'error',
                    '❌ Tarjeta Inválida',
                    'La tarjeta seleccionada no es válida. Por favor selecciona otra tarjeta.',
                    6000
                );
                return;
            }
            // console.log('Procesando archivo con tarjeta:', selectedCardData.name);
        } else {
            // console.log('Sin tarjeta seleccionada - se creará automáticamente desde el PDF');
        }

        setIsAnalyzing(true);
        setAnalysisProgress(0);
        setAnalysisResult(null);
        setExtractedText('');
        setPreviewImage(null);
        setFileInfo({
            name: file.name,
            size: file.size,
            type: file.type,
            lastModified: new Date(file.lastModified)
        });

        try {
            const result = await analyzePDF(file);
            // console.log('🔍 [DEBUG] Resultado crudo de analyzePDF:', {
            //     previousBalance: result?.previousBalance,
            //     totalBalance: result?.totalBalance,
            //     minimumPayment: result?.minimumPayment,
            //     transactionsCount: result?.transactions?.length || 0,
            //     fullResult: result
            // });
            
            // Completar datos faltantes antes de mostrar y validar
            const enrichedResult = await enrichAnalysisResult(result);
            // console.log('🔍 [DEBUG] Resultado después de enriquecimiento:', {
            //     previousBalance: enrichedResult?.previousBalance,
            //     totalBalance: enrichedResult?.totalBalance,
            //     minimumPayment: enrichedResult?.minimumPayment,
            //     transactionsCount: enrichedResult?.transactions?.length || 0
            // });
            setAnalysisResult(enrichedResult);
            
            if (enrichedResult && Object.keys(enrichedResult).length > 0) {
                // console.log('🎯 Análisis exitoso, procediendo a validar:', enrichedResult);
                
                // Debug: verificar qué campos tiene el result para la validación
                // console.log('🔍 Campos disponibles para validación:', {
                //     totalBalance: enrichedResult.totalBalance,
                //     previousBalance: enrichedResult.previousBalance,
                //     minimumPayment: enrichedResult.minimumPayment,
                //     dueDate: enrichedResult.dueDate,
                //     statementDate: enrichedResult.statementDate,
                //     transactions: enrichedResult.transactions?.length || 0
                // });
                
                // Validar la consistencia de los datos extraídos
                const validation = validateStatement(enrichedResult);
                const formattedValidation = formatValidationResult(validation);
                const confidenceScore = getConfidenceScore(validation);
                
                // console.log('🔍 Resultado de validación:', validation);
                // console.log('📊 Puntuación de confianza:', confidenceScore);
                
                setValidationResult({
                    ...formattedValidation,
                    confidenceScore,
                    rawValidation: validation
                });
                setShowValidation(true);
                
                // console.log('💾 Procediendo a guardar:', result);
                await saveStatementData(result);
                // console.log('💾 saveStatementData completado');
                
                // Pequeña pausa para asegurar consistencia en Firestore
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                if (onStatementAnalyzed) {
                    onStatementAnalyzed(result);
                }
            } else {
                console.warn('⚠️ Análisis falló o resultado vacío:', result);
            }
        } catch (error) {
            console.error('Error al analizar PDF:', error);
            
            // Detectar si es un error de cuota específico de Gemini
            if (error.isQuotaError && error.message === 'GEMINI_QUOTA_EXCEEDED') {
                // Actualizar estado para indicar que se excedió la cuota
                setQuotaExceeded(true);
                
                showNotification(
                    'error',
                    '⏳ Límite de Cuota de Gemini Alcanzado',
                    `Has alcanzado el límite diario de 50 solicitudes de Gemini API. El análisis se ha detenido. Espera hasta mañana o cambia a OpenAI en la configuración.`,
                    15000,
                    {
                        text: 'Ver Configuración',
                        action: () => {
                            // Cambiar automáticamente a OpenAI
                            console.log('Usuario quiere cambiar a OpenAI');
                            setSelectedAI('openai');
                            setQuotaExceeded(false);
                            showNotification(
                                'success',
                                '✅ Cambiado a OpenAI',
                                'Ahora puedes continuar analizando con OpenAI. La cuota es mayor.',
                                5000
                            );
                        },
                        autoHide: false
                    }
                );
            } else {
                // Detectar si es un error de cuota general
                const isQuotaError = error.message && (
                    error.message.includes('429') || 
                    error.message.includes('quota') ||
                    error.message.includes('Too Many Requests')
                );
                
                if (isQuotaError) {
                    showNotification(
                        'error',
                        '⏳ Límite de Cuota Alcanzado',
                        'Has alcanzado el límite de la API de IA. El análisis puede continuar con patrones básicos. Espera unos minutos o cambia a OpenAI para mejor cuota.',
                        12000
                    );
                } else {
                    showNotification(
                        'error',
                        '❌ Error de Análisis',
                        'No se pudo analizar el PDF. Verifica que sea un estado de cuenta válido e intenta nuevamente.',
                        8000
                    );
                }
            }
        } finally {
            setIsAnalyzing(false);
        }
    };

    // Convertir PDF a imagen para análisis con Computer Vision
    const convertPDFToImages = async (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async function(e) {
                try {
                    const typedarray = new Uint8Array(e.target.result);
                    const pdf = await pdfjsLib.getDocument(typedarray).promise;
                    
                    console.log('PDF cargado:', pdf.numPages, 'páginas');
                    setAnalysisProgress(20);
                    
                    const images = [];
                    
                    // Convertir cada página a imagen (empezando por la primera)
                    // Procesar más páginas para capturar todas las transacciones
                    const maxPages = Math.min(pdf.numPages, 5); // Máximo 5 páginas para evitar problemas de rendimiento
                    for (let i = 1; i <= maxPages; i++) {
                        const page = await pdf.getPage(i);
                        const viewport = page.getViewport({ scale: 2.0 }); // Alta resolución
                        
                        const canvas = document.createElement('canvas');
                        const context = canvas.getContext('2d');
                        canvas.height = viewport.height;
                        canvas.width = viewport.width;
                        
                        await page.render({
                            canvasContext: context,
                            viewport: viewport
                        }).promise;
                        
                        // Convertir canvas a base64
                        const imageData = canvas.toDataURL('image/png');
                        images.push({
                            page: i,
                            data: imageData,
                            width: viewport.width,
                            height: viewport.height
                        });
                        
                        // Guardar la primera imagen como preview
                        if (i === 1) {
                            setPreviewImage(imageData);
                        }
                        
                        setAnalysisProgress(20 + (i / maxPages) * 30);
                        console.log(`Página ${i} convertida a imagen`);
                    }
                    
                    resolve(images);
                } catch (error) {
                    console.error('Error al convertir PDF a imágenes:', error);
                    reject(error);
                }
            };
            
            reader.onerror = function(error) {
                console.error('Error al leer archivo:', error);
                reject(error);
            };
            
            reader.readAsArrayBuffer(file);
        });
    };

    // Función auxiliar para parsing JSON robusto
    const parseAIResponse = (content) => {
        try {
            console.log('🔍 Usando parser robusto para statement...');
            
            // Verificar si la respuesta está vacía o es muy corta
            if (!content || content.trim() === '' || content.trim() === '[]' || content.trim() === '{}') {
                console.warn('⚠️ La IA devolvió una respuesta vacía o sin contenido útil');
                return {
                    error: 'EMPTY_RESPONSE',
                    message: 'La IA no pudo extraer información útil del PDF. Esto puede suceder por varias razones:',
                    reasons: [
                        'El PDF puede estar corrupto o tener baja calidad',
                        'El formato del PDF puede ser muy complejo',
                        'La IA puede estar experimentando problemas temporales',
                        'El PDF puede no contener un estado de cuenta estándar'
                    ],
                    suggestions: [
                        'Intenta con otro PDF del mismo banco',
                        'Verifica que el PDF sea legible y de buena calidad',
                        'Espera unos minutos y vuelve a intentar',
                        'Si el problema persiste, contacta al soporte'
                    ],
                    totalBalance: null,
                    transactions: []
                };
            }
            
            const result = parseStatementResponse(content);
            
            console.log('🔍 [DEBUG] Resultado del parser:', {
                previousBalance: result?.previousBalance,
                totalBalance: result?.totalBalance,
                minimumPayment: result?.minimumPayment,
                hasError: !!result?.error,
                transactionsCount: result?.transactions?.length || 0
            });
            
            // Si el resultado tiene error, usar el parsing tradicional como fallback
            if (result && result.error) {
                console.warn('⚠️ Parser robusto reportó error, intentando fallback');
                logParsingError(new Error(result.error), content, 'Statement Analysis');
            }
            
            // 🔧 FORZAR ESTRUCTURA COMPLETA - Añadir campos faltantes automáticamente
            if (result && result.transactions && Array.isArray(result.transactions)) {
                console.log('🔧 [FORZADO] Añadiendo campos faltantes a transacciones...');
                
                result.transactions = result.transactions.map((transaction, index) => {
                    if (!transaction || typeof transaction !== 'object') {
                        console.warn(`⚠️ Transacción ${index} inválida, creando por defecto`);
                        return {
                            date: null,
                            description: null,
                            amount: null,
                            type: null,
                            cardNumber: null,
                            cardName: null,
                            foreignCurrencyAmount: null,
                            foreignCurrencyCode: null
                        };
                    }
                    
                    // Extraer información del encabezado para usar como fallback
                    const headerCardNumber = result.lastFourDigits || '0000';
                    const headerCardName = result.cardHolderName || 'Titular Principal';
                    
                    // Asegurar que todos los campos requeridos existan
                    const forcedTransaction = {
                        date: transaction.date || null,
                        description: transaction.description || null,
                        amount: transaction.amount || null,
                        type: transaction.type || null,
                        cardNumber: transaction.cardNumber || headerCardNumber,
                        cardName: transaction.cardName || headerCardName,
                        foreignCurrencyAmount: transaction.foreignCurrencyAmount || null,
                        foreignCurrencyCode: transaction.foreignCurrencyCode || null
                    };
                    
                    // Log de campos forzados
                    const missingFields = [];
                    if (!transaction.cardNumber) missingFields.push('cardNumber');
                    if (!transaction.cardName) missingFields.push('cardName');
                    if (!transaction.foreignCurrencyAmount) missingFields.push('foreignCurrencyAmount');
                    if (!transaction.foreignCurrencyCode) missingFields.push('foreignCurrencyCode');
                    
                    if (missingFields.length > 0) {
                        console.log(`🔧 [FORZADO] Transacción ${index} (${transaction.description}): campos añadidos:`, missingFields);
                        console.log(`   cardNumber: ${forcedTransaction.cardNumber}, cardName: ${forcedTransaction.cardName}`);
                    }
                    
                    return forcedTransaction;
                });
                
                console.log(`✅ [FORZADO] ${result.transactions.length} transacciones procesadas con estructura completa`);
            }
            
            return result;
        } catch (error) {
            console.error('💥 Error crítico en parsing:', error);
            logParsingError(error, content, 'Critical Parsing Error');
            
            // Retornar estructura mínima válida
            return {
                error: 'CRITICAL_PARSE_ERROR',
                message: 'Error crítico en parsing de JSON',
                rawContent: content?.substring(0, 500)
            };
        }
    };

    // Analizar imagen con Gemini Vision
    const analyzeImageWithGemini = async (imageData) => {
        try {
            if (!genAI) {
                throw new Error('Gemini API no está configurada. Por favor configura VITE_GEMINI_API_KEY en tu archivo .env');
            }
            console.log('Enviando imagen a Gemini 1.5 Flash...');
            
            // Convertir data URL a formato que Gemini entiende
            const base64Data = imageData.split(',')[1];
            
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            
            const instructions = generateCommonInstructions();
            
            // Log para debug - verificar que las instrucciones se generen correctamente
            console.log('🔍 [DEBUG] Instrucciones generadas:', {
                hasCompleteStructure: !!instructions.completeAnalysisStructure,
                hasCardInstructions: !!instructions.cardInstructions,
                hasForeignCurrencyInstructions: !!instructions.foreignCurrencyInstructions
            });
            
            const prompt = `Analiza este estado de cuenta de tarjeta de crédito y extrae la siguiente información en formato JSON estricto:

${instructions.completeAnalysisStructure}

## 📋 INSTRUCCIONES PARA GEMINI:
- Extrae fechas, descripciones, montos y tipos de transacciones
- Si encuentras información de tarjeta o moneda extranjera, inclúyela
- Si no la encuentras, no te preocupes - el sistema la completará
- Enfócate en ser preciso con las transacciones básicas

${instructions.criticalFieldsInstructions}

${instructions.criticalTransactionsInstructions}

${instructions.operationTypesInstructions}

${instructions.signColumnsInstructions}

${instructions.transactionTypeLogic}

${instructions.specificPatterns}

${instructions.excludeSubtotalsInstructions}

${instructions.finalInstructionsComplete}`;

            // Log para debug - verificar que el prompt se construya correctamente
            console.log('🔍 [DEBUG] Prompt construido correctamente. Longitud:', prompt.length);
            console.log('🔍 [DEBUG] Prompt incluye campos de tarjeta:', prompt.includes('cardNumber'));
            console.log('🔍 [DEBUG] Prompt incluye campos de moneda extranjera:', prompt.includes('foreignCurrencyAmount'));

            const imagePart = {
                inlineData: {
                    data: base64Data,
                    mimeType: "image/png"
                }
            };

            // Log para debug - verificar el prompt completo que se envía
            console.log('🔍 [DEBUG] Prompt completo enviado a Gemini:', prompt.substring(0, 500) + '...');
            
            const result = await model.generateContent([prompt, imagePart]);
            const response = await result.response;
            const content = response.text();
            
            console.log('Respuesta de Gemini:', content);

            // Usar función de parsing robusto
            const analysisData = parseAIResponse(content);
            
            // Verificar si hubo error de parsing
            if (analysisData.error === 'JSON_PARSE_ERROR') {
                throw new Error(`Gemini devolvió JSON inválido: ${analysisData.message}`);
            }
            
            // Validar y corregir campos faltantes
            const correctedData = validateAndCorrectAnalysisData(analysisData);
            
            console.log('🔍 [GEMINI DEBUG] Datos extraídos con Gemini:', analysisData);
            console.log('🔍 [GEMINI DEBUG] Estructura de transacciones:', analysisData.transactions?.map(t => ({
                description: t.description,
                fields: Object.keys(t),
                hasCardNumber: t.hasOwnProperty('cardNumber'),
                hasCardName: t.hasOwnProperty('cardName'),
                hasForeignCurrency: t.hasOwnProperty('foreignCurrencyAmount')
            })));
            console.log('🔍 [GEMINI DEBUG] Datos corregidos:', correctedData);
            return correctedData;
            
        } catch (error) {
            console.error('Error al analizar con Gemini:', error);
            throw error;
        }
    };

    // Analizar página adicional solo para transacciones
    const analyzePageForTransactions = async (imageData, pageNumber) => {
        try {
            console.log(`🔍 Analizando página ${pageNumber} para transacciones...`);
            console.log(`🔍 [DEBUG] Tipo de imageData:`, typeof imageData);
            console.log(`🔍 [DEBUG] Longitud de imageData:`, imageData?.length || 0);
            console.log(`🔍 [DEBUG] Primeros 100 chars de imageData:`, imageData?.substring(0, 100));
            
            // Usar la IA seleccionada para extraer solo transacciones
            const transactions = selectedAI === 'gemini'
                ? await analyzePageTransactionsWithGemini(imageData, pageNumber)
                : await analyzePageTransactionsWithAI(imageData, pageNumber);
                
            console.log(`🔍 [DEBUG] Resultado de análisis página ${pageNumber}:`, transactions);
            console.log(`🔍 [DEBUG] Tipo de resultado:`, typeof transactions);
            console.log(`🔍 [DEBUG] Es array:`, Array.isArray(transactions));
            console.log(`🔍 [DEBUG] Longitud del resultado:`, transactions?.length || 0);
                
            return transactions || [];
        } catch (error) {
            console.error(`Error analizando página ${pageNumber} para transacciones:`, error);
            
            // Si es un error de cuota de Gemini, propagarlo para detener el proceso
            if (error.isQuotaError && error.message === 'GEMINI_QUOTA_EXCEEDED') {
                throw error; // Propagar el error para que se maneje en el nivel superior
            }
            
            // Para otros errores, retornar array vacío pero continuar
            return [];
        }
    };

    // Analizar página con Gemini solo para transacciones
    // MANEJO DE ERRORES DE CUOTA:
    // - Detecta específicamente errores 429, QuotaFailure, "exceeded your current quota"
    // - Lanza un error personalizado GEMINI_QUOTA_EXCEEDED para detener el proceso
    // - Permite que otros errores continúen el análisis
    const analyzePageTransactionsWithGemini = async (imageData, pageNumber) => {
        try {
            if (!genAI) {
                throw new Error('Gemini API no está configurada');
            }
            
            // Extraer el base64 del imageData (que viene como data URL)
            const base64Data = imageData.split(',')[1];
            
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            
            console.log(`🔍 [DEBUG] === ANÁLISIS GEMINI PÁGINA ${pageNumber} ===`);
            console.log(`🔍 [DEBUG] Tipo de imageData:`, typeof imageData);
            console.log(`🔍 [DEBUG] Longitud de imageData:`, imageData?.length || 0);
            console.log(`🔍 [DEBUG] Primeros 100 chars de imageData:`, imageData?.substring(0, 100));
            console.log(`🔍 [DEBUG] Tipo de base64Data:`, typeof base64Data);
            console.log(`🔍 [DEBUG] Longitud de base64Data:`, base64Data?.length || 0);
            
            const instructions = generateCommonInstructions();
            
            const prompt = `Analiza esta página ${pageNumber} de un estado de cuenta de tarjeta de crédito y extrae TODAS las transacciones en formato JSON estricto:

IMPORTANTE: DEBES incluir TODOS los campos mostrados en la estructura JSON siguiente, incluyendo:
- Los campos de tarjeta: "cardNumber" y "cardName" en CADA transacción
- Los campos de moneda extranjera: "foreignCurrencyAmount" y "foreignCurrencyCode" en CADA transacción

[
  {
    "date": "YYYY-MM-DD",
    "description": "descripción_transacción",
    "amount": número_decimal,
    "type": "cargo|pago|ajuste",
    "group": "pagos|comisiones|intereses|tarjeta_adicional|compras|general",
    "cardNumber": "número_tarjeta" (número de la tarjeta que realizó la transacción),
    "cardName": "nombre_tarjeta" (nombre del titular de la tarjeta),
    "foreignCurrencyAmount": número_decimal (valor en moneda extranjera, si existe),
    "foreignCurrencyCode": "código_moneda" (USD, EUR, etc., si existe)
  }
]

INSTRUCCIONES CRÍTICAS PARA SECCIONES AGRUPADAS:
- Los estados de cuenta suelen tener SECCIONES AGRUPADAS con subtotales
- PRIMER GRUPO: Generalmente "PAGOS/CREDITOS" o "SALDO ANTERIOR" al inicio
- SEGUNDO GRUPO: Comisiones, intereses, notas de débito
- TERCER GRUPO: Consumos/compras del período
- DEBES extraer TODAS las transacciones de TODAS las secciones agrupadas
- NO omitas transacciones por estar en resúmenes o subtotales
- Busca en TODA la página, especialmente en las secciones superiores
- Revisa también secciones de "MOVIMIENTOS DEL PERIODO" o "DETALLE DE MOVIMIENTOS"
- Si hay un subtotal de grupo, extrae también las transacciones individuales que lo componen

INTERPRETACIÓN CRÍTICA DE TIPOS DE OPERACIÓN:
- **"DEV"** = DEVOLUCIÓN = tipo "pago" (crédito que reduce deuda)
- **"CV"** = CRÉDITO = tipo "pago" (crédito que reduce deuda)
- **"PAGO"** = PAGO = tipo "pago" (crédito que reduce deuda)
- **"N/D"** = NOTA DE DÉBITO = tipo "cargo" (débito que aumenta deuda)
- **"CONS."** = CONSUMO = tipo "cargo" (débito que aumenta deuda)
- **"SALDO ANTERIOR"** = tipo "ajuste" (balance inicial)

INTERPRETACIÓN CRÍTICA DE COLUMNAS DE SIGNO:
- **Columna "+/-"**: 
  - **"+"** = DÉBITO (aumenta deuda) = tipo "cargo"
  - **"-"** = CRÉDITO (reduce deuda) = tipo "pago"
  - **Vacía** = Revisar tipo de operación o descripción
- **Columna "SIGNO"** o "INDICADOR":
  - **"D"** = DÉBITO = tipo "cargo"
  - **"C"** = CRÉDITO = tipo "pago"
  - **"+"** = DÉBITO = tipo "cargo"
  - **"-"** = CRÉDITO = tipo "pago"

IMPORTANTE: El tipo de transacción debe basarse en:
1. **PRIMERO**: El TIPO DE OPERACIÓN (DEV, CV, PAGO, N/D, CONS.)
2. **SEGUNDO**: Las columnas de SIGNO (+/-, D/C, +, -)
3. **TERCERO**: El monto (negativo = crédito, positivo = débito, pero no siempre)

- Una transacción con tipo "DEV" siempre es un crédito, aunque el monto sea positivo
- Una transacción con tipo "N/D" siempre es un débito, aunque el monto sea pequeño
- Una transacción con signo "+" siempre es un débito, aunque el tipo de operación sea ambiguo
- Una transacción con signo "-" siempre es un crédito, aunque el tipo de operación sea ambiguo

PATRONES ESPECÍFICOS A BUSCAR EN TRANSACCIONES:
- "SALDO ANTERIOR" o "BALANCE ANTERIOR" (es una transacción)
- "PAGOS/CREDITOS" o "ABONOS" (extrae cada transacción individual)
- "NOTAS DE DÉBITO" o "COMISIONES" (extrae cada cargo individual)
- "CONSUMOS DEL PERIODO" o "MOVIMIENTOS" (extrae cada compra individual)
- Transacciones con tipos como "CV", "DEV", "PAGO", "N/D", "CONS."

INSTRUCCIONES CRÍTICAS PARA EXCLUIR SUBTOTALES Y TOTALES:
- NO consideres como transacción ninguna línea que contenga las palabras "SUBTOTAL" o "TOTAL"
- Estas líneas son resúmenes de grupo y NO son transacciones individuales
- Si encuentras "SUBTOTAL PAGOS", "TOTAL CONSUMOS", "SUBTOTAL COMISIONES", etc., NO los incluyas
- Solo extrae las transacciones individuales que componen esos subtotales
- Los subtotales y totales son informativos, no transacciones reales

INSTRUCCIONES CRÍTICAS PARA MONEDA EXTRANJERA:
- Si una transacción tiene un valor en moneda extranjera, NO uses ese valor como monto principal
- El monto principal debe ser el valor en la moneda local (pesos, soles, etc.)
- El valor en moneda extranjera va en "foreignCurrencyAmount"
- El código de moneda extranjera va en "foreignCurrencyCode" (USD, EUR, GBP, etc.)
- Si no hay moneda extranjera, usa null en ambos campos

INSTRUCCIONES CRÍTICAS PARA TARJETAS:
- Cada transacción debe incluir información de la tarjeta que la realizó
- "cardNumber": número completo o últimos dígitos de la tarjeta (principal o adicional)
- "cardName": nombre del titular de la tarjeta (principal o adicional)
- Si no puedes identificar la tarjeta específica, usa null en ambos campos
- Los bancos suelen agrupar transacciones por tarjeta, identifica a qué tarjeta pertenece cada transacción

INSTRUCCIONES CRÍTICAS PARA DATOS NO RECONOCIDOS:
- Si NO puedes reconocer claramente algún dato, NO lo inventes ni lo adivines
- Para campos numéricos: usa null si no está visible o es ambiguo
- Para campos de texto: usa null si no está legible o es ambiguo
- Para fechas: usa null si no están claras o son ambiguas
- Para transacciones: si no puedes determinar el tipo, monto o fecha, usa null en esos campos
- Es MEJOR dejar un campo vacío (null) que proporcionar información incorrecta
- Si tienes dudas sobre algún dato, déjalo como null

Devuelve SOLO el array JSON de transacciones, sin texto adicional
Si no hay transacciones en esta página, devuelve un array vacío: []
Para montos usa números decimales (ej: 1234.56)
Las fechas en formato YYYY-MM-DD
Los montos negativos indican pagos/créditos
Busca movimientos, compras, pagos, cargos, etc. de TODOS los grupos`;

            const imagePart = {
                inlineData: {
                    data: base64Data,
                    mimeType: "image/png"
                }
            };

            // Log para debug - verificar el prompt completo que se envía
            console.log(`🔍 [DEBUG] Prompt completo enviado a Gemini página ${pageNumber}:`, prompt.substring(0, 500) + '...');
            
            const result = await model.generateContent([prompt, imagePart]);
            const response = await result.response;
            const content = response.text();
            
            console.log(`Respuesta Gemini página ${pageNumber}:`, content);
            const transactions = parseTransactionsResponseLocal(content);
            console.log(`Transacciones extraídas página ${pageNumber}:`, transactions);
            
            // Validar y corregir transacciones
            const correctedTransactions = validateAndCorrectTransactions(transactions);
            console.log(`Transacciones corregidas página ${pageNumber}:`, correctedTransactions);
            
            return correctedTransactions;
        } catch (error) {
            console.error(`Error con Gemini página ${pageNumber}:`, error);
            
            // Detectar específicamente errores de cuota de Gemini
            const isQuotaError = error.message && (
                error.message.includes('429') ||
                error.message.includes('quota') ||
                error.message.includes('Too Many Requests') ||
                error.message.includes('QuotaFailure') ||
                error.message.includes('exceeded your current quota')
            );
            
            if (isQuotaError) {
                // Lanzar un error específico para que se maneje en el nivel superior
                const quotaError = new Error('GEMINI_QUOTA_EXCEEDED');
                quotaError.isQuotaError = true;
                quotaError.originalError = error;
                quotaError.pageNumber = pageNumber;
                throw quotaError;
            }
            
            // Para otros errores, retornar array vacío pero continuar
            return [];
        }
    };

    // Analizar página con OpenAI solo para transacciones
    const analyzePageTransactionsWithAI = async (imageData, pageNumber) => {
        try {
            if (!openai) {
                throw new Error('OpenAI API no está configurada');
            }
            
            console.log(`🔍 [DEBUG] === ANÁLISIS OPENAI PÁGINA ${pageNumber} ===`);
            console.log(`🔍 [DEBUG] Tipo de imageData:`, typeof imageData);
            console.log(`🔍 [DEBUG] Longitud de imageData:`, imageData?.length || 0);
            console.log(`🔍 [DEBUG] Primeros 100 chars de imageData:`, imageData?.substring(0, 100));
            
            const instructions = generateCommonInstructions();
            
            const prompt = `Analiza esta página ${pageNumber} de un estado de cuenta de tarjeta de crédito y extrae TODAS las transacciones en formato JSON estricto:

IMPORTANTE: DEBES incluir TODOS los campos mostrados en la estructura JSON siguiente, incluyendo:
- Los campos de tarjeta: "cardNumber" y "cardName" en CADA transacción
- Los campos de moneda extranjera: "foreignCurrencyAmount" y "foreignCurrencyCode" en CADA transacción

${instructions.transactionsStructure}

${instructions.groupedSectionsInstructions}

${instructions.operationTypesInstructions}

${instructions.signColumnsInstructions}

${instructions.transactionTypeLogic}

${instructions.specificPatterns}

${instructions.excludeSubtotalsInstructions}

${instructions.foreignCurrencyInstructions}

${instructions.cardInstructions}

${instructions.unrecognizedDataInstructions}

${instructions.finalInstructionsTransactions}`;

            // Log para debug - verificar que el prompt se construya correctamente
            console.log(`🔍 [DEBUG] Prompt completo enviado a OpenAI página ${pageNumber}:`, prompt.substring(0, 500) + '...');
            
            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: prompt
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: imageData
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 2000,
                temperature: 0.1 // Baja temperatura para respuestas más consistentes
            });

            const content = response.choices[0].message.content;
            console.log(`🔍 [DEBUG] Respuesta de OpenAI página ${pageNumber}:`, content);
            console.log(`🔍 [DEBUG] Tipo de respuesta:`, typeof content);
            console.log(`🔍 [DEBUG] Longitud de respuesta:`, content?.length || 0);
            console.log(`🔍 [DEBUG] Primeros 200 chars de respuesta:`, content?.substring(0, 200));

            // Usar función de parsing robusto
            const analysisData = parseAIResponse(content);
            
            console.log(`🔍 [DEBUG] Resultado del parsing página ${pageNumber}:`, analysisData);
            console.log(`🔍 [DEBUG] Tipo de resultado:`, typeof analysisData);
            console.log(`🔍 [DEBUG] Estructura del resultado:`, Object.keys(analysisData || {}));
            
            // Verificar si hubo error de parsing
            if (analysisData.error === 'JSON_PARSE_ERROR') {
                throw new Error(`OpenAI devolvió JSON inválido: ${analysisData.message}`);
            }
            
            // Validar y corregir transacciones
            const correctedData = validateAndCorrectTransactions(analysisData);
            
            console.log(`🔍 [DEBUG] Datos extraídos página ${pageNumber}:`, analysisData);
            console.log(`🔍 [DEBUG] Datos corregidos página ${pageNumber}:`, correctedData);
            return correctedData;
            
        } catch (error) {
            console.error(`Error al analizar página ${pageNumber} con OpenAI:`, error);
            throw error;
        }
    };

    // Parsear respuesta de transacciones usando utilidad robusta
    const parseTransactionsResponseLocal = (content) => {
        try {
            console.log('💳 Usando parser robusto para transacciones...');
            const transactions = parseTransactionsResponse(content);
            
            if (!Array.isArray(transactions)) {
                console.warn('⚠️ Parser no devolvió array, usando array vacío');
                return [];
            }
            
            // 🔧 FORZAR ESTRUCTURA COMPLETA - Añadir campos faltantes automáticamente
            console.log('🔧 [FORZADO] Añadiendo campos faltantes a transacciones por página...');
            
            const forcedTransactions = transactions.map((transaction, index) => {
                if (!transaction || typeof transaction !== 'object') {
                    console.warn(`⚠️ Transacción ${index} inválida, creando por defecto`);
                    return {
                        date: null,
                        description: null,
                        amount: null,
                        type: null,
                        group: null,
                        cardNumber: null,
                        cardName: null,
                        foreignCurrencyAmount: null,
                        foreignCurrencyCode: null
                    };
                }
                
                // Usar valores por defecto para campos de tarjeta (se pueden inferir del contexto)
                const defaultCardNumber = '0000';
                const defaultCardName = 'Titular Principal';
                
                // Asegurar que todos los campos requeridos existan
                const forcedTransaction = {
                    date: transaction.date || null,
                    description: transaction.description || null,
                    amount: transaction.amount || null,
                    type: transaction.type || null,
                    group: transaction.group || null,
                    cardNumber: transaction.cardNumber || defaultCardNumber,
                    cardName: transaction.cardName || defaultCardName,
                    foreignCurrencyAmount: transaction.foreignCurrencyAmount || null,
                    foreignCurrencyCode: transaction.foreignCurrencyCode || null
                };
                
                // Log de campos forzados
                const missingFields = [];
                if (!transaction.cardNumber) missingFields.push('cardNumber');
                if (!transaction.cardName) missingFields.push('cardName');
                if (!transaction.foreignCurrencyAmount) missingFields.push('foreignCurrencyAmount');
                if (!transaction.foreignCurrencyCode) missingFields.push('foreignCurrencyCode');
                
                if (missingFields.length > 0) {
                    console.log(`🔧 [FORZADO] Transacción ${index} (${transaction.description}): campos añadidos:`, missingFields);
                    console.log(`   cardNumber: ${forcedTransaction.cardNumber}, cardName: ${forcedTransaction.cardName}`);
                }
                
                return forcedTransaction;
            });
            
            console.log(`✅ [FORZADO] ${forcedTransactions.length} transacciones procesadas con estructura completa`);
            return forcedTransactions;
            
        } catch (error) {
            console.error('💥 Error crítico parseando transacciones:', error);
            logParsingError(error, content, 'Transactions Parsing');
            return [];
        }
    };



    // Analizar imagen con OpenAI Vision API
    const analyzeImageWithAI = async (imageData) => {
        try {
            if (!openai) {
                throw new Error('OpenAI API no está configurada. Por favor configura VITE_OPENAI_API_KEY en tu archivo .env');
            }
            console.log('Enviando imagen a GPT-4o...');
            
            const instructions = generateCommonInstructions();
            
            // Log para debug - verificar que las instrucciones se generen correctamente
            console.log('🔍 [DEBUG] Instrucciones generadas para OpenAI:', {
                hasCompleteStructure: !!instructions.completeAnalysisStructure,
                hasCardInstructions: !!instructions.cardInstructions,
                hasForeignCurrencyInstructions: !!instructions.foreignCurrencyInstructions
            });
            
            const prompt = `Analiza este estado de cuenta de tarjeta de crédito y extrae la siguiente información en formato JSON estricto:

${instructions.completeAnalysisStructure}

## 📋 INSTRUCCIONES PARA OPENAI:
- Extrae fechas, descripciones, montos y tipos de transacciones
- Si encuentras información de tarjeta o moneda extranjera, inclúyela
- Si no la encuentras, no te preocupes - el sistema la completará
- Enfócate en ser preciso con las transacciones básicas

${instructions.criticalFieldsInstructions}

${instructions.criticalTransactionsInstructions}

${instructions.operationTypesInstructions}

${instructions.signColumnsInstructions}

${instructions.transactionTypeLogic}

${instructions.specificPatterns}

${instructions.excludeSubtotalsInstructions}

${instructions.foreignCurrencyInstructions}

${instructions.cardInstructions}

${instructions.unrecognizedDataInstructions}

${instructions.finalInstructionsComplete}`;

            // Log para debug - verificar que el prompt se construya correctamente
            console.log('🔍 [DEBUG] Prompt construido correctamente para OpenAI. Longitud:', prompt.length);
            console.log('🔍 [DEBUG] Prompt incluye campos de tarjeta:', prompt.includes('cardNumber'));
            console.log('🔍 [DEBUG] Prompt incluye campos de moneda extranjera:', prompt.includes('foreignCurrencyAmount'));

            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: prompt
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: imageData
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 2000,
                temperature: 0.1 // Baja temperatura para respuestas más consistentes
            });

            const content = response.choices[0].message.content;
            console.log('Respuesta de OpenAI:', content);

            // Usar función de parsing robusto
            const analysisData = parseAIResponse(content);
            
            // Verificar si hubo error de parsing
            if (analysisData.error === 'JSON_PARSE_ERROR') {
                throw new Error(`OpenAI devolvió JSON inválido: ${analysisData.message}`);
            }
            
            // Validar y corregir campos faltantes
            const correctedData = validateAndCorrectAnalysisData(analysisData);
            
            console.log('Datos extraídos:', analysisData);
            console.log('Datos corregidos:', correctedData);
            return correctedData;
            
        } catch (error) {
            console.error('Error al analizar con OpenAI:', error);
            throw error;
        }
    };

    // Función principal de análisis
    const analyzePDF = async (file) => {
        try {
            setIsAnalyzing(true);
            setAnalysisProgress(0);
            setExtractedText('🔄 Iniciando análisis del PDF...');
            setQuotaExceeded(false); // Resetear estado de cuota al inicio
            
            console.log('🚀 Iniciando análisis de PDF:', file.name);
            console.log('🔍 [DEBUG] IA seleccionada para análisis:', selectedAI);
            
            // Validar que se haya seleccionado una IA
            if (!selectedAI) {
                throw new Error('No se ha seleccionado una IA para el análisis. Por favor, espera a que se cargue la configuración o selecciona una manualmente.');
            }
            
            // 1. Convertir PDF a imágenes
            const images = await convertPDFToImages(file);
            setAnalysisProgress(50);
            
            // 2. Analizar la primera página (contiene información general y algunas transacciones)
            const mainPageImage = images[0];
            setExtractedText(`Imagen de ${images.length} página(s) generada. Analizando página 1 con IA...`);
            
            // 3. Analizar con la IA seleccionada
            // Analizar con la IA seleccionada con manejo robusto de errores
            let analysis;
            try {
                analysis = selectedAI === 'gemini' 
                    ? await analyzeImageWithGemini(mainPageImage.data)
                    : await analyzeImageWithAI(mainPageImage.data);
                
                // Validar que el análisis tiene estructura mínima
                if (!analysis || typeof analysis !== 'object') {
                    throw new Error('IA devolvió respuesta vacía o inválida');
                }
                
                console.log('✅ Análisis de página principal completado');
                
                // 🔍 [DEBUG] LOG DETALLADO DE TRANSACCIONES DE LA PRIMERA PÁGINA
                console.log('🔍 [DEBUG] === ANÁLISIS DE PÁGINA PRINCIPAL ===');
                console.log('🔍 [DEBUG] Tipo de análisis:', typeof analysis);
                console.log('🔍 [DEBUG] Estructura del análisis:', Object.keys(analysis));
                console.log('🔍 [DEBUG] Transacciones en análisis principal:', analysis.transactions);
                console.log('🔍 [DEBUG] Cantidad de transacciones:', analysis.transactions?.length || 0);
                
                if (analysis.transactions && analysis.transactions.length > 0) {
                    console.log('🔍 [DEBUG] Detalle de transacciones de la primera página:');
                    analysis.transactions.forEach((t, i) => {
                        console.log(`  ${i + 1}. [${t.group || 'sin grupo'}] ${t.description?.substring(0, 40)}... | ${t.amount} | ${t.type}`);
                    });
                }
                
            } catch (analysisError) {
                console.error('💥 Error en análisis principal:', analysisError);
                
                // Crear estructura mínima válida como fallback
                analysis = {
                    error: 'ANALYSIS_ERROR',
                    message: `Error en análisis: ${analysisError.message}`,
                    totalBalance: null,
                    transactions: []
                };
                
                // Mostrar notificación al usuario
                showNotification(
                    'error',
                    '⚠️ Error de Análisis',
                    'La IA tuvo problemas analizando el PDF. Los datos pueden estar incompletos.',
                    8000
                );
            }
            
            // Verificar si hay error específico de respuesta vacía
            if (analysis && analysis.error === 'EMPTY_RESPONSE') {
                console.log('📭 La IA devolvió respuesta vacía - mostrando mensaje amistoso al usuario');
                
                // Mostrar notificación específica para respuesta vacía
                showNotification(
                    'warning',
                    '🤔 No se pudo extraer información del PDF',
                    'La IA no pudo extraer información útil. Esto puede suceder por varias razones. Revisa la consola para más detalles.',
                    12000
                );
                
                // Actualizar el texto extraído con información útil
                setExtractedText(`❌ La IA no pudo extraer información útil del PDF.

🔍 Posibles causas:
• El PDF puede estar corrupto o tener baja calidad
• El formato del PDF puede ser muy complejo
• La IA puede estar experimentando problemas temporales
• El PDF puede no contener un estado de cuenta estándar

💡 Sugerencias:
• Intenta con otro PDF del mismo banco
• Verifica que el PDF sea legible y de buena calidad
• Espera unos minutos y vuelve a intentar
• Si el problema persiste, contacta al soporte

📋 Detalles técnicos:
• Respuesta de la IA: ${analysis.originalContent || 'Vacía'}
• Error: ${analysis.message}`);
                
                // Detener el análisis aquí ya que no hay datos útiles
                setIsAnalyzing(false);
                setAnalysisProgress(0);
                return;
            }
            
            console.log('📄 Análisis página 1 completado:', analysis);
            setAnalysisProgress(60);
            
            // 4. Si hay múltiples páginas, analizar páginas adicionales para más transacciones
            if (images.length > 1) {
                console.log(`📚 Procesando ${images.length} páginas. Analizando páginas adicionales para más transacciones...`);
                setExtractedText(`📚 Analizando ${images.length - 1} página(s) adicional(es) para más transacciones...`);
                
                const additionalTransactions = [];
                
                // Analizar páginas 2 en adelante solo para transacciones
                for (let i = 1; i < images.length; i++) {
                    const pageNum = i + 1;
                    console.log(`🔍 Analizando página ${pageNum} para transacciones...`);
                    setExtractedText(`🔍 Analizando página ${pageNum} de ${images.length} para transacciones...`);
                    
                    try {
                        const pageTransactions = await analyzePageForTransactions(images[i].data, pageNum);
                        if (pageTransactions && pageTransactions.length > 0) {
                            console.log(`✅ Página ${pageNum}: ${pageTransactions.length} transacciones encontradas`);
                            
                            // 🔍 [DEBUG] LOG DETALLADO DE TRANSACCIONES DE PÁGINAS ADICIONALES
                            console.log(`🔍 [DEBUG] === TRANSACCIONES PÁGINA ${pageNum} ===`);
                            pageTransactions.forEach((t, i) => {
                                console.log(`  ${i + 1}. [${t.group || 'sin grupo'}] ${t.description?.substring(0, 40)}... | ${t.amount} | ${t.type}`);
                            });
                            
                            additionalTransactions.push(...pageTransactions);
                        } else {
                            console.log(`⚪ Página ${pageNum}: No se encontraron transacciones`);
                        }
                    } catch (pageError) {
                        console.error(`❌ Error analizando página ${pageNum}:`, pageError);
                        
                        // Si es un error de cuota de Gemini, detener todo el proceso
                        if (pageError.isQuotaError && pageError.message === 'GEMINI_QUOTA_EXCEEDED') {
                            console.error('💥 ERROR CRÍTICO: Cuota de Gemini excedida. Deteniendo análisis.');
                            
                            // Actualizar estado para indicar que se excedió la cuota
                            setQuotaExceeded(true);
                            
                            // Mostrar notificación específica de cuota
                            showNotification(
                                'error',
                                '⏳ Límite de Cuota de Gemini Alcanzado',
                                `Has alcanzado el límite diario de 50 solicitudes de Gemini API. El análisis se ha detenido. Espera hasta mañana o cambia a OpenAI en la configuración.`,
                                15000,
                                {
                                    text: 'Ver Configuración',
                                    action: () => {
                                        // Cambiar automáticamente a OpenAI
                                        console.log('Usuario quiere cambiar a OpenAI');
                                        setSelectedAI('openai');
                                        setQuotaExceeded(false);
                                        showNotification(
                                            'success',
                                            '✅ Cambiado a OpenAI',
                                            'Ahora puedes continuar analizando con OpenAI. La cuota es mayor.',
                                            5000
                                        );
                                    },
                                    autoHide: false
                                }
                            );
                            
                            // Detener el análisis y salir del bucle
                            break;
                        }
                        
                        // Para otros errores, continuar con las siguientes páginas
                        console.log(`⚠️ Continuando con la siguiente página después del error...`);
                    }
                    
                    setAnalysisProgress(60 + ((i + 1) / images.length) * 25);
                }
                
                // Combinar transacciones de todas las páginas
                if (additionalTransactions.length > 0) {
                    console.log(`🔄 Combinando ${additionalTransactions.length} transacciones adicionales con ${analysis.transactions?.length || 0} de la primera página`);
                    
                    // Log detallado de todas las transacciones antes de combinar
                    console.log('📄 Transacciones de la primera página:');
                    (analysis.transactions || []).forEach((t, i) => {
                        console.log(`  ${i + 1}. ${t.description?.substring(0, 30)}... | ${t.amount} | ${t.type}`);
                    });
                    
                    console.log('📄 Transacciones adicionales de otras páginas:');
                    additionalTransactions.forEach((t, i) => {
                        console.log(`  ${i + 1}. ${t.description?.substring(0, 30)}... | ${t.amount} | ${t.type}`);
                    });
                    
                    analysis.transactions = [...(analysis.transactions || []), ...additionalTransactions];
                    
                    // 🔍 [DEBUG] LOG DESPUÉS DE COMBINAR
                    console.log('🔍 [DEBUG] === DESPUÉS DE COMBINAR ===');
                    console.log('🔍 [DEBUG] Total de transacciones combinadas:', analysis.transactions.length);
                    console.log('🔍 [DEBUG] Detalle de todas las transacciones combinadas:');
                    analysis.transactions.forEach((t, i) => {
                        console.log(`  ${i + 1}. [${t.group || 'sin grupo'}] ${t.description?.substring(0, 40)}... | ${t.amount} | ${t.type}`);
                    });
                    
                    // Eliminar duplicados basados en fecha y descripción
                    const beforeDedup = analysis.transactions.length;
                    analysis.transactions = analysis.transactions.filter((transaction, index, self) => 
                        index === self.findIndex(t => 
                            t.date === transaction.date && t.description === transaction.description && t.amount === transaction.amount
                        )
                    );
                    
                    console.log(`✅ Total de transacciones después de combinar y deduplicar: ${analysis.transactions.length} (antes: ${beforeDedup})`);
                    
                    // 🔍 [DEBUG] LOG DESPUÉS DE DEDUPLICAR
                    console.log('🔍 [DEBUG] === DESPUÉS DE DEDUPLICAR ===');
                    console.log('🔍 [DEBUG] Transacciones finales después de deduplicar:');
                    analysis.transactions.forEach((t, i) => {
                        console.log(`  ${i + 1}. [${t.group || 'sin grupo'}] ${t.description?.substring(0, 40)}... | ${t.amount} | ${t.type}`);
                    });
                    
                    // Log detallado de pagos detectados específicamente
                    const paymentTransactions = analysis.transactions.filter(t => {
                        const amount = parseFloat(t.amount) || 0;
                        const description = (t.description || '').toLowerCase();
                        return (t.type === 'pago' || t.type === 'payment' || t.type === 'abono') ||
                               (description.includes('pago') || description.includes('abono') || description.includes('payment')) ||
                               amount < 0;
                    });
                    
                    console.log(`💳 PAGOS DETECTADOS POR LA IA (${paymentTransactions.length}):`);
                    paymentTransactions.forEach((payment, index) => {
                        const amount = parseFloat(payment.amount) || 0;
                        console.log(`  ${index + 1}. ${payment.description?.substring(0, 40)}... → ${amount} | Tipo: ${payment.type} | Grupo: ${payment.group || 'sin grupo'}`);
                    });
                }
            }
            
            setAnalysisProgress(85);
            
            // 5. Categorizar transacciones automáticamente (NO BLOQUEANTE)
            if (analysis.transactions && analysis.transactions.length > 0) {
                setExtractedText(`🔄 Categorizando ${analysis.transactions.length} transacciones con IA...`);
                console.log('Categorizando transacciones...');
                
                // 🔍 [DEBUG] LOG ANTES DE CATEGORIZAR
                console.log('🔍 [DEBUG] === ANTES DE CATEGORIZAR ===');
                console.log('🔍 [DEBUG] Transacciones antes de categorizar:', analysis.transactions.length);
                console.log('🔍 [DEBUG] Referencia de transacciones:', analysis.transactions);
                analysis.transactions.forEach((t, i) => {
                    console.log(`  ${i + 1}. [${t.group || 'sin grupo'}] ${t.description?.substring(0, 40)}... | ${t.amount} | ${t.type}`);
                });
                
                try {
                    // 🔍 [DEBUG] INTENTANDO CATEGORIZACIÓN
                    console.log('🔍 [DEBUG] Iniciando categorización con IA...');
                    const categorizedTransactions = await categorizeTransactions(analysis.transactions, userPatterns, userSettings);
                    
                    // 🔍 [DEBUG] LOG DESPUÉS DE CATEGORIZAR
                    console.log('🔍 [DEBUG] === DESPUÉS DE CATEGORIZAR ===');
                    console.log('🔍 [DEBUG] Transacciones después de categorizar:', categorizedTransactions.length);
                    console.log('🔍 [DEBUG] Referencia de transacciones categorizadas:', categorizedTransactions);
                    categorizedTransactions.forEach((t, i) => {
                        console.log(`  ${i + 1}. [${t.group || 'sin grupo'}] ${t.description?.substring(0, 40)}... | ${t.amount} | ${t.type} | Categoría: ${t.category || 'sin categoría'}`);
                    });
                    
                    // 🔍 [DEBUG] ASIGNANDO TRANSACCIONES CATEGORIZADAS
                    console.log('🔍 [DEBUG] Asignando transacciones categorizadas al análisis...');
                    analysis.transactions = categorizedTransactions;
                    console.log('🔍 [DEBUG] Transacciones asignadas al análisis:', analysis.transactions.length);
                    console.log('🔍 [DEBUG] Referencia final de transacciones:', analysis.transactions);
                    
                    console.log('✅ Transacciones categorizadas exitosamente:', categorizedTransactions);
                    
                } catch (categorizationError) {
                    // 🔍 [DEBUG] ERROR EN CATEGORIZACIÓN - CONTINUAR SIN CATEGORIZAR
                    console.error('❌ Error en categorización con IA:', categorizationError);
                    console.warn('⚠️ Continuando sin categorización - transacciones se mantienen sin categorizar');
                    
                    // 🔍 [DEBUG] VERIFICAR QUE LAS TRANSACCIONES SIGUEN AQUÍ
                    console.log('🔍 [DEBUG] === DESPUÉS DE ERROR DE CATEGORIZACIÓN ===');
                    console.log('🔍 [DEBUG] Transacciones en análisis después del error:', analysis.transactions?.length || 0);
                    console.log('🔍 [DEBUG] Referencia de transacciones después del error:', analysis.transactions);
                    if (analysis.transactions && analysis.transactions.length > 0) {
                        analysis.transactions.forEach((t, i) => {
                            console.log(`  ${i + 1}. [${t.group || 'sin grupo'}] ${t.description?.substring(0, 40)}... | ${t.amount} | ${t.type}`);
                        });
                    } else {
                        console.error('🚨 CRÍTICO: Las transacciones se perdieron después del error de categorización');
                    }
                    
                    // 🔍 [DEBUG] ASIGNAR CATEGORÍA "other" A TODAS LAS TRANSACCIONES
                    console.log('🔍 [DEBUG] Asignando categoría "other" a todas las transacciones...');
                    analysis.transactions = analysis.transactions.map(transaction => ({
                        ...transaction,
                        category: 'other',
                        categoryConfidence: 'low',
                        categoryMethod: 'fallback',
                        categoryPatternId: null,
                        categoryData: null
                    }));
                    
                    console.log('🔍 [DEBUG] Transacciones con categoría fallback:', analysis.transactions.length);
                }
            }
            
            setAnalysisProgress(100);
            setExtractedText(`✅ Análisis completado con IA. ${images.length} página(s) procesada(s). ${analysis.transactions?.length || 0} transacciones categorizadas.`);
            
            // 🔍 [DEBUG] LOG FINAL DEL ANÁLISIS
            console.log('🔍 [DEBUG] === RESULTADO FINAL DEL ANÁLISIS ===');
            console.log('🔍 [DEBUG] Total de transacciones finales:', analysis.transactions?.length || 0);
            console.log('🔍 [DEBUG] Referencia final de transacciones:', analysis.transactions);
            console.log('🔍 [DEBUG] Tipo de transacciones:', typeof analysis.transactions);
            console.log('🔍 [DEBUG] Es array:', Array.isArray(analysis.transactions));
            if (analysis.transactions && analysis.transactions.length > 0) {
                console.log('🔍 [DEBUG] Transacciones finales:');
                analysis.transactions.forEach((t, i) => {
                    console.log(`  ${i + 1}. [${t.group || 'sin grupo'}] ${t.description?.substring(0, 40)}... | ${t.amount} | ${t.type} | Categoría: ${t.category || 'sin categoría'}`);
                });
            } else {
                console.log('  ⚠️ No hay transacciones en el resultado final');
            }
            
            // 🔍 [DEBUG] VERIFICACIÓN FINAL DE INTEGRIDAD
            console.log('🔍 [DEBUG] === VERIFICACIÓN FINAL DE INTEGRIDAD ===');
            console.log('🔍 [DEBUG] Estado del objeto analysis:', {
                hasTransactions: !!analysis.transactions,
                transactionsType: typeof analysis.transactions,
                transactionsLength: analysis.transactions?.length || 0,
                isArray: Array.isArray(analysis.transactions),
                keys: Object.keys(analysis),
                hasError: !!analysis.error
            });
            
            return analysis;
            
        } catch (error) {
            console.error('Error en análisis:', error);
            setExtractedText(`❌ Error en análisis: ${error.message}`);
            throw error;
        }
    };

    const saveStatementData = async (analysisData, skipCardValidation = false, explicitCardId = null) => {
        try {
            console.log('🚀 === INICIANDO GUARDADO DE ESTADO DE CUENTA ===');
            console.log('📥 Datos recibidos para guardar:', analysisData);
            console.log('selectedCard ID:', selectedCard);
            console.log('explicitCardId:', explicitCardId);
            console.log('cards array length:', cards.length);
            console.log('cards:', cards.map(c => ({ id: c.id, name: c.name })));
            
            // 🔍 [DEBUG] LOG DE TRANSACCIONES ANTES DEL GUARDADO
            console.log('🔍 [DEBUG] === GUARDADO - TRANSACCIONES RECIBIDAS ===');
            console.log('🔍 [DEBUG] Tipo de analysisData:', typeof analysisData);
            console.log('🔍 [DEBUG] Estructura de analysisData:', Object.keys(analysisData));
            console.log('🔍 [DEBUG] Transacciones en analysisData:', analysisData.transactions);
            console.log('🔍 [DEBUG] Cantidad de transacciones:', analysisData.transactions?.length || 0);
            
            if (analysisData.transactions && analysisData.transactions.length > 0) {
                console.log('🔍 [DEBUG] Detalle de transacciones antes del guardado:');
                analysisData.transactions.forEach((t, i) => {
                    console.log(`  ${i + 1}. [${t.group || 'sin grupo'}] ${t.description?.substring(0, 40)}... | ${t.amount} | ${t.type}`);
                });
            }
            
            // Buscar la tarjeta seleccionada (priorizar explicitCardId si se proporciona)
            let selectedCardData = null;
            if (explicitCardId) {
                selectedCardData = cards.find(card => card.id === explicitCardId);
                console.log('selectedCardData encontrada por explicitCardId:', selectedCardData);
            } else {
                selectedCardData = cards.find(card => card.id === selectedCard);
                console.log('selectedCardData encontrada por selectedCard:', selectedCardData);
            }
            
            // Si no existe la tarjeta y no estamos omitiendo validación, usar lógica inteligente para detectar duplicados
            if (!selectedCardData && !skipCardValidation) {
                console.log('🔄 Tarjeta no encontrada, analizando duplicados...');
                selectedCardData = await handleMissingCard(analysisData);
                if (!selectedCardData) {
                    // Pausar el guardado hasta que el usuario confirme
                    return { pending: true, message: 'Esperando confirmación del usuario para crear tarjeta' };
                }
            } else if (!selectedCardData && skipCardValidation) {
                console.error('❌ Error crítico: skipCardValidation=true pero no hay tarjeta seleccionada');
                throw new Error('Tarjeta no encontrada después de confirmación del usuario');
            }
            
            // Validar si este estado de cuenta es más reciente que el actual
            const shouldUpdateCard = await shouldUpdateCardData(selectedCardData, analysisData);
            console.log('¿Debe actualizar tarjeta?', shouldUpdateCard);

            // Guardar normalmente con formato compatible con Dashboard
            const statementData = {
                userId: user.uid,
                cardId: selectedCardData.id,
                cardName: selectedCardData.name,
                fileName: fileInfo?.name || 'estado_cuenta.pdf',
                appId,
                
                // Campos principales para el Dashboard
                statementDate: analysisData.statementDate || new Date().toISOString().split('T')[0],
                totalBalance: analysisData.totalBalance || 0,
                minimumPayment: analysisData.minimumPayment || 0,
                dueDate: analysisData.dueDate || null,
                creditLimit: analysisData.creditLimit || 0,
                availableCredit: analysisData.availableCredit || 0,
                previousBalance: analysisData.previousBalance || 0,
                payments: analysisData.payments || 0,
                charges: analysisData.charges || 0,
                fees: analysisData.fees || 0,
                interest: analysisData.interest || 0,
                
                // Información adicional
                bankName: analysisData.bankName || '',
                cardHolderName: analysisData.cardHolderName || '',
                lastFourDigits: analysisData.lastFourDigits || '',
                transactions: [], // Se llenará después con datos encriptados
                
                // Metadatos
                analyzedAt: new Date(),
                createdAt: new Date(),
                analysisData: analysisData // Mantener datos originales para referencia
            };

            // Encriptar transacciones antes de guardar
            if (analysisData.transactions && Array.isArray(analysisData.transactions)) {
                console.log('🔐 Encriptando transacciones...');
                
                // 🔍 [DEBUG] LOG ANTES DE ENCRIPTAR
                console.log('🔍 [DEBUG] === GUARDADO - ANTES DE ENCRIPTAR ===');
                console.log('🔍 [DEBUG] Transacciones a encriptar:', analysisData.transactions.length);
                analysisData.transactions.forEach((t, i) => {
                    console.log(`  ${i + 1}. [${t.group || 'sin grupo'}] ${t.description?.substring(0, 40)}... | ${t.amount} | ${t.type}`);
                });
                
                const encryptedTransactions = await Promise.all(
                    analysisData.transactions.map(async (transaction) => ({
                        ...transaction,
                        description: await encryptText(transaction.description || '', user.uid)
                    }))
                );
                statementData.transactions = encryptedTransactions;
                
                // 🔍 [DEBUG] LOG DESPUÉS DE ENCRIPTAR
                console.log('🔍 [DEBUG] === GUARDADO - DESPUÉS DE ENCRIPTAR ===');
                console.log('🔍 [DEBUG] Transacciones encriptadas:', encryptedTransactions.length);
                encryptedTransactions.forEach((t, i) => {
                    console.log(`  ${i + 1}. [${t.group || 'sin grupo'}] ${t.description?.substring(0, 40)}... | ${t.amount} | ${t.type}`);
                });
                
                console.log('✅ Transacciones encriptadas:', encryptedTransactions.length);
            } else {
                console.log('⚠️ No hay transacciones para encriptar o no es un array válido');
                console.log('🔍 [DEBUG] Tipo de transactions:', typeof analysisData.transactions);
                console.log('🔍 [DEBUG] Valor de transactions:', analysisData.transactions);
            }

            console.log('Datos finales a guardar:', statementData);
            
            // 🔍 [DEBUG] LOG FINAL ANTES DEL GUARDADO
            console.log('🔍 [DEBUG] === GUARDADO - DATOS FINALES ===');
            console.log('🔍 [DEBUG] Transacciones en statementData:', statementData.transactions?.length || 0);
            if (statementData.transactions && statementData.transactions.length > 0) {
                statementData.transactions.forEach((t, i) => {
                    console.log(`  ${i + 1}. [${t.group || 'sin grupo'}] ${t.description?.substring(0, 40)}... | ${t.amount} | ${t.type}`);
                });
            }

            console.log('💾 Guardando en path: artifacts/${appId}/users/${user.uid}/statements');
            
            const statementsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'statements');
            const docRef = await addDoc(statementsRef, statementData);
            
            console.log('✅ Estado de cuenta guardado exitosamente con ID:', docRef.id);
            console.log('✅ Path completo guardado:', `artifacts/${appId}/users/${user.uid}/statements/${docRef.id}`);
            
            // Verificación inmediata de que se guardó
            try {
                const verifyRef = collection(db, 'artifacts', appId, 'users', user.uid, 'statements');
                const verifySnapshot = await getDocs(verifyRef);
                console.log('🔍 Verificación inmediata - Documentos en statements:', verifySnapshot.size);
            } catch (verifyError) {
                console.error('❌ Error en verificación:', verifyError);
            }
            
            // Actualizar la tarjeta con los nuevos datos (solo si es más reciente)
            if (shouldUpdateCard) {
                try {
                    // Obtener resumen de cambios antes de actualizar
                    const changesSummary = getCardUpdateSummary(selectedCardData, analysisData);
                    
                    await updateCardWithStatementData(selectedCardData.id, analysisData);
                    console.log('✅ Tarjeta actualizada con datos más recientes');
                    
                    // Mostrar notificación de actualización con detalles
                    if (changesSummary.length > 0) {
                        showNotification(
                            'success',
                            '🔄 Tarjeta Actualizada',
                            `Los datos de "${selectedCardData.name}" se han actualizado:\n${changesSummary.join('\n')}`,
                            8000
                        );
                    } else {
                        showNotification(
                            'success',
                            '🔄 Tarjeta Actualizada',
                            `Los datos de "${selectedCardData.name}" se han actualizado con la información más reciente del estado de cuenta.`,
                            6000
                        );
                    }
                } catch (updateError) {
                    console.error('❌ Error al actualizar tarjeta:', updateError);
                    showNotification(
                        'warning',
                        '⚠️ Actualización Parcial',
                        `El estado de cuenta se guardó correctamente, pero no se pudieron actualizar todos los datos de la tarjeta.`,
                        8000
                    );
                }
            } else {
                console.log('⏭️ Estado de cuenta anterior - tarjeta no actualizada');
            }
            
            showNotification(
                'success',
                '✅ ¡Análisis Completado!',
                `Estado de cuenta analizado y guardado exitosamente. ${analysisData.transactions?.length || 0} transacciones categorizadas. Revisa y corrige las categorías si es necesario.`,
                15000, // 15 segundos o hasta que el usuario interactúe
                {
                    label: '📊 Ir al Dashboard',
                    onClick: () => {
                        setNotification(prev => ({ ...prev, show: false }));
                        if (onNavigateToDashboard) {
                            onNavigateToDashboard();
                        }
                    },
                    autoHide: false // No auto-ocultar para dar tiempo a revisar
                }
            );
            
            // Notificar al padre para que recargue los datos
            if (onStatementAnalyzed) {
                onStatementAnalyzed({
                    cardId: selectedCard,
                    analysisData,
                    statementId: docRef.id
                });
            }
            
        } catch (error) {
            console.error('💥 Error al guardar estado de cuenta:', error);
            showNotification(
                'error',
                '❌ Error al Guardar',
                `No se pudo guardar el estado de cuenta: ${error.message}`,
                10000
            );
        }
    };

    // Manejar tarjeta faltante con lógica inteligente de duplicados
    const handleMissingCard = async (analysisData) => {
        console.log('🔍 Iniciando análisis inteligente de duplicados...');
        
        // Verificar si las tarjetas están aún cargándose
        if (isLoadingCards) {
            console.log('⏳ Las tarjetas aún se están cargando, esperando...');
            // Esperar a que terminen de cargar
            let attempts = 0;
            while (isLoadingCards && attempts < 10) {
                await new Promise(resolve => setTimeout(resolve, 500));
                attempts++;
                console.log(`⏳ Esperando carga de tarjetas... intento ${attempts}/10`);
            }
            
            if (isLoadingCards) {
                console.error('❌ Timeout esperando carga de tarjetas');
                showNotification(
                    'error',
                    '❌ Error',
                    'No se pudieron cargar las tarjetas existentes',
                    5000
                );
                return null;
            }
        }
        
        console.log('📋 Tarjetas disponibles para comparar:', cards.length);
        console.log('📋 Lista de tarjetas:', cards.map(c => ({ 
            id: c.id, 
            name: c.name, 
            bank: c.bank, 
            cardNumber: c.cardNumber 
        })));
        console.log('📄 Datos del análisis para comparar:', {
            bankName: analysisData.bankName,
            lastFourDigits: analysisData.lastFourDigits,
            cardHolderName: analysisData.cardHolderName,
            creditLimit: analysisData.creditLimit
        });
        
        // Buscar coincidencia exacta de tarjeta
        const cardMatchResult = findExactCardMatch(cards, analysisData);
        const suggestions = generateCardSuggestions(cardMatchResult, cards);
        
        console.log('📊 Análisis de coincidencia exacta:', cardMatchResult);
        console.log('💡 Sugerencias generadas:', suggestions);
        
        // 🔒 VALIDACIÓN: Solo proceder si hay datos suficientes para crear una tarjeta
        if (!analysisData || typeof analysisData !== 'object') {
            console.log('❌ analysisData es inválido:', analysisData);
            showNotification(
                'warning',
                '⚠️ Datos Inválidos',
                'Los datos del análisis no son válidos. No se puede crear una tarjeta.',
                5000
            );
            return null;
        }

        // Validar que las propiedades críticas existan y sean del tipo correcto
        const hasRequiredProperties = 
            analysisData.bankName && 
            typeof analysisData.bankName === 'string' &&
            analysisData.lastFourDigits && 
            typeof analysisData.lastFourDigits === 'string';

        if (!hasRequiredProperties) {
            console.log('❌ Propiedades críticas faltantes en analysisData:', {
                bankName: analysisData.bankName,
                lastFourDigits: analysisData.lastFourDigits,
                bankNameType: typeof analysisData.bankName,
                lastFourDigitsType: typeof analysisData.lastFourDigits
            });
            showNotification(
                'warning',
                '⚠️ Datos Insuficientes',
                'No se pueden extraer datos suficientes de la tarjeta para crear un registro. El análisis continuará sin crear tarjeta.',
                5000
            );
            return null;
        }

        if (!hasSufficientDataForCardCreation(analysisData)) {
            console.log('❌ Datos insuficientes para crear tarjeta:', {
                bankName: analysisData.bankName,
                lastFourDigits: analysisData.lastFourDigits,
                cardHolderName: analysisData.cardHolderName
            });
            
            showNotification(
                'warning',
                '⚠️ Datos Insuficientes',
                'No se pueden extraer datos suficientes de la tarjeta para crear un registro. El análisis continuará sin crear tarjeta.',
                5000
            );
            
            return null; // No crear tarjeta, pero continuar con el análisis
        }
        
        // Si es seguro crear automáticamente, hacerlo sin confirmación
        if (isSafeToAutoCreate(cardMatchResult, analysisData, cards)) {
            // Verificar si hay coincidencia exacta
            if (cardMatchResult.exactMatches && cardMatchResult.exactMatches.length > 0) {
                // Hay coincidencia exacta - usar la tarjeta existente
                const existingCard = cardMatchResult.exactMatches[0].card;
                console.log('🎯 Usando tarjeta existente:', existingCard.name);
                setSelectedCard(existingCard.id);
                
                showNotification(
                    'success',
                    '🔗 Tarjeta Vinculada',
                    `Estado de cuenta vinculado automáticamente con "${existingCard.name}"`,
                    3000
                );
                
                // Continuar con el guardado del statement usando la tarjeta existente
                return await saveStatementData(analysisData, false, existingCard.id);
            } else {
                // No hay coincidencia pero es la primera tarjeta - crear automáticamente
                console.log('✅ Es seguro crear automáticamente (primera tarjeta)');
                showNotification(
                    'info',
                    '🤖 Creando Primera Tarjeta',
                    'No hay tarjetas existentes. Creando nueva tarjeta...',
                    3000
                );
                return await createCardFromAnalysis(analysisData);
            }
        }
        
        // Si no es seguro, mostrar modal de confirmación
        console.log('⚠️ Requiere confirmación del usuario');
        setCardCreationModal({
            isOpen: true,
            suggestions,
            analysisData,
            pendingAnalysis: analysisData
        });
        
        return null; // Pausar hasta que el usuario confirme
    };

    // Crear tarjeta automáticamente desde análisis (Opción A - datos completos)
    const createCardFromAnalysis = async (analysisData) => {
        try {
            console.log('🔄 Creando tarjeta automáticamente desde análisis...');
            
            // 🔒 VALIDACIÓN ADICIONAL antes de crear
            if (!analysisData || typeof analysisData !== 'object') {
                console.error('❌ analysisData es inválido en createCardFromAnalysis:', analysisData);
                throw new Error('Datos de análisis inválidos');
            }

            // Validar propiedades críticas
            if (!analysisData.bankName || typeof analysisData.bankName !== 'string') {
                console.error('❌ bankName inválido en createCardFromAnalysis:', analysisData.bankName);
                throw new Error('Nombre del banco inválido');
            }

            if (!analysisData.lastFourDigits || typeof analysisData.lastFourDigits !== 'string') {
                console.error('❌ lastFourDigits inválido en createCardFromAnalysis:', analysisData.lastFourDigits);
                throw new Error('Últimos 4 dígitos inválidos');
            }
            
            if (!hasSufficientDataForCardCreation(analysisData)) {
                console.error('❌ Validación falló en createCardFromAnalysis');
                throw new Error('Datos insuficientes para crear tarjeta');
            }
            
            // Construir nombre de tarjeta inteligente
            const cardName = analysisData.cardHolderName 
                ? `${analysisData.bankName} - ${analysisData.cardHolderName}`
                : `${analysisData.bankName} Credit Card`;
            
            const newCardData = {
                name: await encryptText(cardName, user.uid),
                bank: await encryptText(analysisData.bankName || 'Banco Desconocido', user.uid),
                cardNumber: await encryptText(`****${analysisData.lastFourDigits || 'xxxx'}`, user.uid),
                type: 'credit', // Asumir crédito por defecto
                limit: analysisData.creditLimit || 0,
                currentBalance: analysisData.totalBalance || 0,
                color: '#059669', // Verde por defecto
                dueDate: analysisData.dueDate || null,
                lastStatementDate: analysisData.statementDate || new Date().toISOString().split('T')[0],
                createdAt: new Date(),
                autoCreated: true, // Marcar como creada automáticamente
                lastUpdated: new Date(),
                lastAnalyzedAt: new Date()
            };

            console.log('Datos de nueva tarjeta:', { 
                cardName, 
                bank: analysisData.bankName,
                lastFour: analysisData.lastFourDigits,
                limit: analysisData.creditLimit,
                balance: analysisData.totalBalance
            });

            const cardsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'creditCards');
            const docRef = await addDoc(cardsRef, newCardData);
            
            // Crear objeto para uso local
            const newCard = {
                id: docRef.id,
                name: cardName,
                bank: analysisData.bankName || 'Banco Desconocido',
                cardNumber: `****${analysisData.lastFourDigits || 'xxxx'}`,
                type: 'credit',
                limit: analysisData.creditLimit || 0,
                currentBalance: analysisData.totalBalance || 0,
                color: '#059669',
                dueDate: analysisData.dueDate || null,
                lastStatementDate: analysisData.statementDate || new Date().toISOString().split('T')[0],
                createdAt: new Date(),
                autoCreated: true
            };

            // Actualizar el estado local
            setCards(prevCards => [...prevCards, newCard]);
            setSelectedCard(docRef.id);

            console.log('✅ Tarjeta creada automáticamente con ID:', docRef.id);
            return newCard;
            
        } catch (error) {
            console.error('Error al crear tarjeta automáticamente:', error);
            return null;
        }
    };

    // Validar si el estado de cuenta es más reciente que el actual
    const shouldUpdateCardData = async (cardData, analysisData) => {
        try {
            console.log('🔍 Validando si se debe actualizar la tarjeta...');
            console.log('📊 Datos de la tarjeta actual:', {
                lastStatementDate: cardData.lastStatementDate,
                currentBalance: cardData.currentBalance,
                limit: cardData.limit,
                dueDate: cardData.dueDate
            });
            console.log('📊 Datos del nuevo análisis:', {
                statementDate: analysisData.statementDate,
                totalBalance: analysisData.totalBalance,
                creditLimit: analysisData.creditLimit,
                dueDate: analysisData.dueDate
            });

            // Si no hay fecha del estado de cuenta, no actualizar
            if (!analysisData.statementDate) {
                console.log('⚠️ Sin fecha de estado de cuenta, no actualizando tarjeta');
                return false;
            }

            // Si la tarjeta no tiene fecha de último estado, siempre actualizar
            if (!cardData.lastStatementDate) {
                console.log('✅ Primera vez - actualizando tarjeta');
                return true;
            }

            // Comparar fechas
            const newStatementDate = new Date(analysisData.statementDate);
            const lastStatementDate = new Date(cardData.lastStatementDate);

            const isNewer = newStatementDate > lastStatementDate;
            const isSameDate = newStatementDate.getTime() === lastStatementDate.getTime();
            
            console.log('📅 Comparación de fechas:', {
                nuevaFecha: analysisData.statementDate,
                fechaActual: cardData.lastStatementDate,
                esMasReciente: isNewer,
                esMismaFecha: isSameDate
            });

            // Si es más reciente, siempre actualizar
            if (isNewer) {
                console.log('✅ Estado de cuenta más reciente - actualizando tarjeta');
                return true;
            }

            // Si es la misma fecha, verificar si hay información más completa
            if (isSameDate) {
                console.log('📅 Misma fecha - verificando si hay información más completa...');
                
                // Verificar si hay información más completa o actualizada
                const hasMoreCompleteInfo = (
                    // Tener saldo más actualizado
                    (analysisData.totalBalance !== null && analysisData.totalBalance !== undefined) ||
                    // Tener límite de crédito más actualizado
                    (analysisData.creditLimit !== null && analysisData.creditLimit !== undefined) ||
                    // Tener fecha de vencimiento más actualizada
                    (analysisData.dueDate !== null && analysisData.dueDate !== undefined) ||
                    // Tener más transacciones o información más detallada
                    (analysisData.transactions && analysisData.transactions.length > 0)
                );

                if (hasMoreCompleteInfo) {
                    console.log('✅ Misma fecha pero información más completa - actualizando tarjeta');
                    return true;
                } else {
                    console.log('⏭️ Misma fecha y sin información adicional - no actualizando');
                    return false;
                }
            }

            // Si es anterior, no actualizar
            console.log('⏭️ Estado de cuenta anterior - no actualizando tarjeta');
            return false;
            
        } catch (error) {
            console.error('Error al validar fechas:', error);
            // En caso de error, mejor no actualizar
            return false;
        }
    };

    // Actualizar tarjeta con datos del estado de cuenta
    const updateCardWithStatementData = async (cardId, analysisData) => {
        try {
            console.log('🔄 Actualizando tarjeta con datos del análisis...');
            
            const cardRef = doc(db, 'artifacts', appId, 'users', user.uid, 'creditCards', cardId);
            
            // Preparar datos de actualización
            const updateData = {
                // Metadatos de actualización
                lastUpdated: new Date(),
                lastAnalyzedAt: new Date()
            };
            
            // Solo actualizar campos si tienen valores válidos
            if (analysisData.totalBalance !== null && analysisData.totalBalance !== undefined) {
                updateData.currentBalance = analysisData.totalBalance;
                console.log('💰 Actualizando saldo actual:', analysisData.totalBalance);
            }
            
            if (analysisData.creditLimit !== null && analysisData.creditLimit !== undefined) {
                updateData.limit = analysisData.creditLimit;
                console.log('💳 Actualizando límite de crédito:', analysisData.creditLimit);
            }
            
            if (analysisData.dueDate) {
                updateData.dueDate = analysisData.dueDate;
                console.log('📅 Actualizando fecha de vencimiento:', analysisData.dueDate);
            }
            
            if (analysisData.statementDate) {
                updateData.lastStatementDate = analysisData.statementDate;
                console.log('📊 Actualizando fecha del último estado de cuenta:', analysisData.statementDate);
            }
            
            // Actualizar información del banco si está disponible y es diferente
            if (analysisData.bankName) {
                updateData.bank = await encryptText(analysisData.bankName, user.uid);
                console.log('🏦 Actualizando nombre del banco:', analysisData.bankName);
            }
            
            // Actualizar nombre del titular si está disponible y es diferente
            if (analysisData.cardHolderName) {
                updateData.name = await encryptText(analysisData.cardHolderName, user.uid);
                console.log('👤 Actualizando nombre del titular:', analysisData.cardHolderName);
            }
            
            // Actualizar últimos 4 dígitos si están disponibles
            if (analysisData.lastFourDigits) {
                updateData.cardNumber = await encryptText(`****${analysisData.lastFourDigits}`, user.uid);
                console.log('🔢 Actualizando últimos 4 dígitos:', analysisData.lastFourDigits);
            }
            
            console.log('📝 Datos de actualización preparados:', updateData);
            
            // Solo actualizar si hay campos para actualizar
            if (Object.keys(updateData).length > 1) { // Más de 1 porque siempre incluye lastUpdated
                await updateDoc(cardRef, updateData);
                console.log('✅ Tarjeta actualizada exitosamente con', Object.keys(updateData).length - 1, 'campos');
            } else {
                console.log('ℹ️ No hay campos nuevos para actualizar');
            }
            
        } catch (error) {
            console.error('❌ Error al actualizar tarjeta:', error);
            // No fallar si no se puede actualizar la tarjeta
            throw error; // Re-lanzar para que el llamador pueda manejarlo
        }
    };

    // Función para obtener un resumen de los cambios en la tarjeta
    const getCardUpdateSummary = (cardData, analysisData) => {
        const changes = [];
        
        if (analysisData.totalBalance !== null && analysisData.totalBalance !== undefined) {
            const oldBalance = cardData.currentBalance || 0;
            if (oldBalance !== analysisData.totalBalance) {
                changes.push(`Saldo: $${oldBalance.toLocaleString()} → $${analysisData.totalBalance.toLocaleString()}`);
            }
        }
        
        if (analysisData.creditLimit !== null && analysisData.creditLimit !== undefined) {
            const oldLimit = cardData.limit || 0;
            if (oldLimit !== analysisData.creditLimit) {
                changes.push(`Límite: $${oldLimit.toLocaleString()} → $${analysisData.creditLimit.toLocaleString()}`);
            }
        }
        
        if (analysisData.dueDate && cardData.dueDate !== analysisData.dueDate) {
            changes.push(`Vencimiento: ${cardData.dueDate || 'No establecido'} → ${analysisData.dueDate}`);
        }
        
        if (analysisData.bankName && cardData.bank !== analysisData.bankName) {
            changes.push(`Banco: ${cardData.bank || 'No establecido'} → ${analysisData.bankName}`);
        }
        
        if (analysisData.cardHolderName && cardData.name !== analysisData.cardHolderName) {
            changes.push(`Titular: ${cardData.name || 'No establecido'} → ${analysisData.cardHolderName}`);
        }
        
        return changes;
    };

    // Función para enriquecer el resultado del análisis con datos faltantes
    const enrichAnalysisResult = async (result) => {
        console.log('🔧 Enriqueciendo resultado del análisis...');
        
        if (!result) return result;
        
        // 🔍 [DEBUG] LOG DEL RESULTADO ORIGINAL
        console.log('🔍 [DEBUG] === ENRIQUECIMIENTO - RESULTADO ORIGINAL ===');
        console.log('🔍 [DEBUG] Tipo de resultado:', typeof result);
        console.log('🔍 [DEBUG] Estructura del resultado:', Object.keys(result));
        console.log('🔍 [DEBUG] Transacciones originales:', result.transactions);
        console.log('🔍 [DEBUG] Cantidad de transacciones originales:', result.transactions?.length || 0);
        
        if (result.transactions && result.transactions.length > 0) {
            console.log('🔍 [DEBUG] Detalle de transacciones originales:');
            result.transactions.forEach((t, i) => {
                console.log(`  ${i + 1}. [${t.group || 'sin grupo'}] ${t.description?.substring(0, 40)}... | ${t.amount} | ${t.type}`);
            });
        }
        
        const enriched = { ...result };
        
        // Si no hay saldo anterior pero sí hay transacciones, intentar extraerlo
        if ((enriched.previousBalance === undefined || enriched.previousBalance === null) && 
            enriched.transactions && enriched.transactions.length > 0) {
            
            console.log('🔍 Saldo anterior faltante, buscando en transacciones...');
            const extractedPreviousBalance = findPreviousBalanceInTransactions(enriched.transactions);
            
            if (extractedPreviousBalance !== null) {
                enriched.previousBalance = extractedPreviousBalance;
                console.log('✅ Saldo anterior extraído de transacciones:', extractedPreviousBalance);
            }
        }
        
        // 🔍 [DEBUG] LOG DEL RESULTADO ENRIQUECIDO
        console.log('🔍 [DEBUG] === ENRIQUECIMIENTO - RESULTADO FINAL ===');
        console.log('🔍 [DEBUG] Transacciones enriquecidas:', enriched.transactions);
        console.log('🔍 [DEBUG] Cantidad de transacciones enriquecidas:', enriched.transactions?.length || 0);
        
        if (enriched.transactions && enriched.transactions.length > 0) {
            console.log('🔍 [DEBUG] Detalle de transacciones enriquecidas:');
            enriched.transactions.forEach((t, i) => {
                console.log(`  ${i + 1}. [${t.group || 'sin grupo'}] ${t.description?.substring(0, 40)}... | ${t.amount} | ${t.type}`);
            });
        }
        
        console.log('📊 Resultado enriquecido:', {
            originalPreviousBalance: result.previousBalance,
            enrichedPreviousBalance: enriched.previousBalance,
            totalBalance: enriched.totalBalance,
            transactionsCount: enriched.transactions?.length || 0
        });
        
        return enriched;
    };

    // Función para buscar saldo anterior en transacciones (misma lógica del validador)
    const findPreviousBalanceInTransactions = (transactions) => {
        console.log('🔍 [UI] Buscando saldo anterior en transacciones...');
        
        for (let i = 0; i < Math.min(transactions.length, 5); i++) {
            const transaction = transactions[i];
            const description = (transaction.description || '').toLowerCase();
            
            console.log(`📄 [UI] Transacción ${i + 1}:`, {
                description: transaction.description?.substring(0, 50) + '...',
                amount: transaction.amount,
                type: transaction.type
            });
            
            // Buscar patrones que indiquen saldo anterior
            if (description.includes('saldo anterior') || 
                description.includes('balance anterior') || 
                description.includes('saldo previo') ||
                description.includes('previous balance') ||
                description.includes('balance brought forward') ||
                description.includes('saldo inicial') ||
                description.includes('balance inicial') ||
                (i === 0 && (description.includes('saldo') || description.includes('balance')))) {
                
                const amount = parseFloat(transaction.amount);
                if (!isNaN(amount) && amount !== 0) {
                    // IMPORTANTE: Preservar el signo original para saldos a favor
                    // Un saldo negativo (-457.47) significa saldo a favor del cliente
                    // Un saldo positivo (+378.64) significa deuda del cliente
                    console.log(`✅ [UI] Saldo anterior encontrado: $${amount} en "${transaction.description}" (${amount >= 0 ? 'deuda' : 'saldo a favor'})`);
                    return amount; // Retornar con signo original
                }
            }
            
            // Si la primera transacción es un tipo específico y tiene monto significativo
            if (i === 0 && transaction.type === 'saldo_anterior' && transaction.amount) {
                const amount = parseFloat(transaction.amount);
                if (!isNaN(amount)) {
                    console.log(`✅ [UI] Saldo anterior por tipo: $${amount} (${amount >= 0 ? 'deuda' : 'saldo a favor'})`);
                    return amount; // Retornar con signo original
                }
            }
        }
        
        console.log('❌ [UI] No se encontró saldo anterior en transacciones');
        return null;
    };

    const resetAnalysis = () => {
        setAnalysisResult(null);
        setExtractedText('');
        setPreviewImage(null);
        setFileInfo(null);
        setAnalysisProgress(0);
        setValidationResult(null);
        setShowValidation(false);
        setCardCreationModal({
            isOpen: false,
            suggestions: null,
            analysisData: null,
            pendingAnalysis: null
        });
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // Manejar confirmación de creación de nueva tarjeta desde modal
    const handleCreateNewCard = async () => {
        try {
            const { pendingAnalysis } = cardCreationModal;
            if (!pendingAnalysis) return;

            // 🔒 VALIDACIÓN: Verificar que los datos sean suficientes antes de crear
            if (!hasSufficientDataForCardCreation(pendingAnalysis)) {
                console.error('❌ Datos insuficientes para crear tarjeta en handleCreateNewCard');
                showNotification(
                    'error',
                    '❌ Datos Insuficientes',
                    'No se pueden extraer datos suficientes de la tarjeta para crear un registro.',
                    5000
                );
                return;
            }

            console.log('✅ Usuario confirmó crear nueva tarjeta');
            
            // Cerrar modal inmediatamente
            setCardCreationModal({
                isOpen: false,
                suggestions: null,
                analysisData: null,
                pendingAnalysis: null
            });
            
            const newCard = await createCardFromAnalysis(pendingAnalysis);
            
            if (newCard) {
                // Recargar tarjetas para incluir la nueva
                await loadCards();
                
                // Verificar si se debe actualizar la tarjeta recién creada
                // (esto puede suceder si hay información más completa en el análisis)
                const shouldUpdate = await shouldUpdateCardData(newCard, pendingAnalysis);
                console.log('¿Debe actualizar tarjeta recién creada?', shouldUpdate);
                
                if (shouldUpdate) {
                    console.log('🔄 Actualizando tarjeta recién creada con información adicional...');
                    try {
                        await updateCardWithStatementData(newCard.id, pendingAnalysis);
                        console.log('✅ Tarjeta recién creada actualizada con información adicional');
                    } catch (updateError) {
                        console.warn('⚠️ No se pudo actualizar la tarjeta recién creada:', updateError);
                        // Continuar sin fallar
                    }
                }
                
                // Continuar con el guardado del statement usando la nueva tarjeta directamente
                await saveStatementData(pendingAnalysis, false, newCard.id);
                
                showNotification(
                    'success',
                    '✅ Tarjeta Creada',
                    `Nueva tarjeta "${newCard.name}" creada exitosamente`,
                    5000
                );
            }
        } catch (error) {
            console.error('Error creando nueva tarjeta:', error);
            showNotification(
                'error',
                '❌ Error',
                'No se pudo crear la nueva tarjeta',
                5000
            );
        }
    };

    // Manejar vinculación con tarjeta existente desde modal
    const handleLinkExistingCard = async (existingCard) => {
        try {
            const { pendingAnalysis } = cardCreationModal;
            if (!pendingAnalysis || !existingCard) return;

            // 🔒 VALIDACIÓN: Verificar que los datos sean suficientes antes de vincular
            if (!hasSufficientDataForCardCreation(pendingAnalysis)) {
                console.error('❌ Datos insuficientes para vincular tarjeta en handleLinkExistingCard');
                showNotification(
                    'error',
                    '❌ Datos Insuficientes',
                    'No se pueden extraer datos suficientes de la tarjeta para vincular con un registro existente.',
                    5000
                );
                return;
            }

            console.log('🔗 Usuario eligió vincular con tarjeta existente:', existingCard.name);
            
            // Cerrar modal inmediatamente
            setCardCreationModal({
                isOpen: false,
                suggestions: null,
                analysisData: null,
                pendingAnalysis: null
            });
            
            // Usar la tarjeta existente y esperar a que se actualice el estado
            setSelectedCard(existingCard.id);
            
            // Esperar a que el estado se actualice antes de continuar
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Verificar si este estado de cuenta es más reciente que el actual de la tarjeta
            const shouldUpdate = await shouldUpdateCardData(existingCard, pendingAnalysis);
            console.log('¿Debe actualizar tarjeta existente?', shouldUpdate);
            
                            if (shouldUpdate) {
                    console.log('🔄 Actualizando datos de tarjeta existente con información más reciente...');
                    
                    // Obtener resumen de cambios antes de actualizar
                    const changesSummary = getCardUpdateSummary(existingCard, pendingAnalysis);
                    
                    // Actualizar la tarjeta con los nuevos datos
                    await updateCardWithStatementData(existingCard.id, pendingAnalysis);
                    
                    // Recargar las tarjetas para obtener los datos actualizados
                    await loadCards();
                    
                    // Mostrar notificación con detalles de los cambios
                    if (changesSummary.length > 0) {
                        showNotification(
                            'success',
                            '🔄 Tarjeta Actualizada',
                            `Los datos de "${existingCard.name}" se han actualizado:\n${changesSummary.join('\n')}`,
                            8000
                        );
                    } else {
                        showNotification(
                            'success',
                            '🔄 Tarjeta Actualizada',
                            `Los datos de "${existingCard.name}" se han actualizado con la información más reciente del estado de cuenta.`,
                            6000
                        );
                    }
                } else {
                    console.log('⏭️ Estado de cuenta anterior - tarjeta no actualizada');
                    showNotification(
                        'info',
                        'ℹ️ Sin Cambios',
                        `El estado de cuenta es anterior al último registrado para "${existingCard.name}". Los datos de la tarjeta no se han modificado.`,
                        5000
                    );
                }
            
            // Continuar con el guardado del statement usando la tarjeta existente directamente
            await saveStatementData(pendingAnalysis, false, existingCard.id);
            
            showNotification(
                'success',
                '🔗 Tarjeta Vinculada',
                `Estado de cuenta vinculado con "${existingCard.name}"`,
                5000
            );
        } catch (error) {
            console.error('Error vinculando tarjeta:', error);
            showNotification(
                'error',
                '❌ Error',
                'No se pudo vincular con la tarjeta existente',
                5000
            );
        }
    };

    // Función para mostrar información detallada sobre el error de cuota
    const showQuotaErrorInfo = () => {
        showNotification(
            'info',
            'ℹ️ Información sobre Límites de Cuota',
            `Gemini API: 50 solicitudes gratuitas por día
OpenAI: Mayor cuota disponible
Para continuar analizando, cambia a OpenAI en la configuración o espera hasta mañana.`,
            20000,
            {
                text: 'Cambiar a OpenAI',
                action: () => {
                    // Cambiar automáticamente a OpenAI
                    console.log('Usuario quiere cambiar a OpenAI');
                    setSelectedAI('openai');
                    setQuotaExceeded(false);
                    showNotification(
                        'success',
                        '✅ Cambiado a OpenAI',
                        'Ahora puedes continuar analizando con OpenAI. La cuota es mayor.',
                        5000
                    );
                },
                autoHide: false
            }
        );
    };

    // Función para cambiar automáticamente a OpenAI
    const switchToOpenAI = () => {
        if (openai) {
            setSelectedAI('openai');
            setQuotaExceeded(false);
            showNotification(
                'success',
                '✅ Cambiado a OpenAI',
                'Ahora puedes continuar analizando con OpenAI. La cuota es mayor.',
                5000
            );
        } else {
            showNotification(
                'error',
                '❌ OpenAI no disponible',
                'OpenAI no está configurado. Configura tu API key de OpenAI en la configuración.',
                8000
            );
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                    {t('pdfAnalyzer.title')}
                </h2>
                <p className="text-gray-600 dark:text-gray-300">
                    Sube tu estado de cuenta en PDF y obtén un análisis automático usando inteligencia artificial
                </p>
            </div>

            <div className="space-y-6">
                {/* Selección de IA */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Inteligencia Artificial
                        {isLoadingSettings && (
                            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                                ⏳ Cargando configuración...
                            </span>
                        )}
                    </label>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                        <button
                            onClick={() => setSelectedAI('gemini')}
                            disabled={!genAI}
                            className={`p-3 rounded-lg border-2 transition-all ${
                                selectedAI === 'gemini'
                                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                                    : !genAI
                                    ? 'border-gray-200 dark:border-gray-600 opacity-50 cursor-not-allowed'
                                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="font-semibold text-gray-900 dark:text-white">Gemini 1.5 Flash</h3>
                                    <p className="text-xs text-gray-600 dark:text-gray-300">
                                        {genAI ? 'Gratis • Google AI' : 'No configurado'}
                                    </p>
                                </div>
                                <div className={`w-4 h-4 rounded-full ${
                                    selectedAI === 'gemini' ? 'bg-green-500' : 'bg-gray-300'
                                }`}></div>
                            </div>
                        </button>
                        
                        <button
                            onClick={() => setSelectedAI('openai')}
                            disabled={!openai}
                            className={`p-3 rounded-lg border-2 transition-all ${
                                selectedAI === 'openai'
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                    : !openai
                                    ? 'border-gray-200 dark:border-gray-600 opacity-50 cursor-not-allowed'
                                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="font-semibold text-gray-900 dark:text-white">GPT-4o</h3>
                                    <p className="text-xs text-gray-600 dark:text-gray-300">
                                        {openai ? '~$0.01 • OpenAI' : 'No configurado'}
                                    </p>
                                </div>
                                <div className={`w-4 h-4 rounded-full ${
                                    selectedAI === 'openai' ? 'bg-blue-500' : 'bg-gray-300'
                                }`}></div>
                            </div>
                        </button>
                    </div>
                </div>

                {/* Selección de tarjeta */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t('pdfAnalyzer.selectCard')}
                    </label>
                    {isLoadingCards ? (
                        <div className="flex items-center space-x-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
                            <span className="text-sm text-gray-600 dark:text-gray-300">
                                {t('pdfAnalyzer.loadingCards')}
                            </span>
                        </div>
                    ) : (
                        <select
                            value={selectedCard}
                            onChange={(e) => handleCardSelect(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white"
                        >
                            {isLoadingCards ? (
                                <option value="">⏳ Cargando tarjetas...</option>
                            ) : cards.length === 0 ? (
                                <option value="">No hay tarjetas - se creará automáticamente</option>
                            ) : (
                                <>
                                    <option value="">Selecciona una tarjeta o déjala vacía para análisis inteligente</option>
                                    {cards.map((card) => (
                                        <option key={card.id} value={card.id}>
                                            {card.name} - {card.bank} (****{card.cardNumber?.slice(-4) || 'xxxx'})
                                        </option>
                                    ))}
                                </>
                            )}
                        </select>
                    )}
                    {!isLoadingCards && cards.length === 0 && (
                        <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                            <p className="text-sm text-blue-800 dark:text-blue-200">
                                💡 <strong>Sin tarjetas registradas:</strong> Al analizar tu PDF, se creará automáticamente una tarjeta con los datos extraídos del estado de cuenta.
                            </p>
                        </div>
                    )}
                    
                    {!isLoadingCards && cards.length > 0 && (
                        <div className="mt-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                            <p className="text-sm text-green-800 dark:text-green-200">
                                ✨ <strong>Creación automática:</strong> Si el PDF es de una tarjeta diferente, se creará automáticamente una nueva tarjeta.
                            </p>
                        </div>
                    )}
                </div>

                {/* Carga de archivo */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t('pdfAnalyzer.selectFile')}
                    </label>
                    <div className="flex items-center space-x-4">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf"
                            onChange={handleFileSelect}
                            disabled={isAnalyzing}
                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white disabled:opacity-50"
                        />
                        {analysisResult && (
                            <button
                                onClick={resetAnalysis}
                                className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors"
                            >
                                Nuevo Análisis
                            </button>
                        )}
                    </div>
                </div>

                {/* Progreso del análisis */}
                {isAnalyzing && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                                Analizando con {selectedAI === 'gemini' ? 'Gemini 1.5 Flash' : 'GPT-4o'}...
                            </span>
                            <span className="text-sm text-blue-700 dark:text-blue-300">
                                {analysisProgress}%
                            </span>
                        </div>
                        <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                            <div
                                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${analysisProgress}%` }}
                            ></div>
                        </div>
                    </div>
                )}

                {/* Indicador de cuota excedida */}
                {quotaExceeded && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                        <div className="flex items-start">
                            <div className="flex-shrink-0">
                                <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div className="ml-3">
                                <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                                    ⏳ Límite de Cuota Alcanzado
                                </h3>
                                <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                                    <p className="mb-2">
                                        Has alcanzado el límite diario de 50 solicitudes de Gemini API. 
                                        El análisis se ha detenido.
                                    </p>
                                    <div className="space-y-2">
                                        <p><strong>Opciones disponibles:</strong></p>
                                        <ul className="list-disc list-inside ml-4 space-y-1">
                                            <li>Esperar hasta mañana para que se resetee la cuota</li>
                                            <li>Cambiar a OpenAI en la configuración (mayor cuota disponible)</li>
                                            <li>Usar solo la primera página del PDF (si ya se analizó)</li>
                                        </ul>
                                    </div>
                                </div>
                                <div className="mt-4 flex space-x-3">
                                    <button
                                        onClick={showQuotaErrorInfo}
                                        className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md bg-red-100 text-red-800 hover:bg-red-200 transition-colors"
                                    >
                                        ℹ️ Más Información
                                    </button>
                                    {openai && (
                                        <button
                                            onClick={switchToOpenAI}
                                            className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md bg-green-100 text-green-800 hover:bg-green-200 transition-colors"
                                        >
                                            🔄 Cambiar a OpenAI
                                        </button>
                                    )}
                                    {!openai && (
                                        <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-2 py-1 rounded">
                                            ⚠️ OpenAI no configurado
                                        </div>
                                    )}
                                    <button
                                        onClick={() => setQuotaExceeded(false)}
                                        className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md bg-gray-100 text-gray-800 hover:bg-gray-200 transition-colors"
                                    >
                                        Ocultar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Información del archivo */}
                {fileInfo && !quotaExceeded && !(analysisResult && analysisResult.error === 'EMPTY_RESPONSE') && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                        <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
                            Información del Archivo
                        </h3>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span className="font-medium text-blue-700 dark:text-blue-300">Nombre:</span>
                                <span className="ml-2 text-blue-600 dark:text-blue-200">{fileInfo.name}</span>
                            </div>
                            <div>
                                <span className="font-medium text-blue-700 dark:text-blue-300">Tamaño:</span>
                                <span className="ml-2 text-blue-600 dark:text-blue-200">{(fileInfo.size / 1024).toFixed(1)} KB</span>
                            </div>
                            <div>
                                <span className="font-medium text-blue-700 dark:text-blue-300">Tipo:</span>
                                <span className="ml-2 text-blue-600 dark:text-blue-200">{fileInfo.type}</span>
                            </div>
                            <div>
                                <span className="font-medium text-blue-700 dark:text-blue-300">Fecha:</span>
                                <span className="ml-2 text-blue-600 dark:text-blue-200">{fileInfo.lastModified.toLocaleDateString()}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Preview de la imagen */}
                {previewImage && !quotaExceeded && !(analysisResult && analysisResult.error === 'EMPTY_RESPONSE') && (
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            Vista Previa del Documento
                        </h3>
                        <div className="max-h-96 overflow-auto border rounded">
                            <img 
                                src={previewImage} 
                                alt="Preview del PDF" 
                                className="w-full h-auto"
                                style={{ maxWidth: '100%' }}
                            />
                        </div>
                    </div>
                )}

                {/* Status del análisis */}
                {extractedText && !quotaExceeded && !(analysisResult && analysisResult.error === 'EMPTY_RESPONSE') && (
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                            Estado del Análisis
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-300">{extractedText}</p>
                    </div>
                )}

                {/* Componente de Validación */}
                {showValidation && validationResult && !quotaExceeded && !(analysisResult && analysisResult.error === 'EMPTY_RESPONSE') && (
                    <div className={`p-4 rounded-lg border-2 mb-6 ${
                        validationResult.status === 'success' 
                            ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
                            : 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20'
                    }`}>
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    {validationResult.title}
                                </h3>
                                <div className="ml-3 flex items-center">
                                    <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                                        validationResult.confidenceScore >= 90 ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                                        validationResult.confidenceScore >= 70 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                                        'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                    }`}>
                                        Confianza: {validationResult.confidenceScore}%
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowValidation(false)}
                                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        
                        <p className="text-gray-700 dark:text-gray-300 mb-3">
                            {validationResult.summary}
                        </p>
                        
                        {validationResult.details.length > 0 && (
                            <div className="space-y-2">
                                {validationResult.details.map((detail, index) => (
                                    <div key={index} className={`flex items-start space-x-2 p-2 rounded ${
                                        detail.type === 'error' ? 'bg-red-50 dark:bg-red-900/30' :
                                        detail.type === 'warning' && detail.severity === 'high' ? 'bg-orange-50 dark:bg-orange-900/30' :
                                        'bg-blue-50 dark:bg-blue-900/30'
                                    }`}>
                                        <span className="text-sm">{detail.icon}</span>
                                        <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">
                                            {detail.message}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                        
                        {validationResult.status === 'warning' && (
                            <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/30 rounded border border-blue-200 dark:border-blue-800">
                                <p className="text-sm text-blue-800 dark:text-blue-200 font-medium mb-1">
                                    💡 Recomendación:
                                </p>
                                <p className="text-sm text-blue-700 dark:text-blue-300">
                                    Revisa manualmente los datos marcados como inconsistentes antes de confiar completamente en ellos.
                                    {validationResult.confidenceScore < 70 && " Considera volver a procesar el PDF con mejor calidad."}
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* Resultados del análisis */}
                {analysisResult && !quotaExceeded && !(analysisResult.error === 'EMPTY_RESPONSE') && (
                    <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-6 border border-green-200 dark:border-green-800">
                        <h3 className="text-xl font-semibold text-green-900 dark:text-green-100 mb-4">
                            ✅ Análisis Completado
                        </h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {/* Información básica */}
                            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
                                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Información General</h4>
                                <div className="space-y-1 text-sm">
                                    {analysisResult.bankName && (
                                        <p><span className="font-medium">Banco:</span> {analysisResult.bankName}</p>
                                    )}
                                    {analysisResult.cardHolderName && (
                                        <p><span className="font-medium">Titular:</span> {analysisResult.cardHolderName}</p>
                                    )}
                                    {analysisResult.lastFourDigits && (
                                        <p><span className="font-medium">Tarjeta:</span> ****{analysisResult.lastFourDigits}</p>
                                    )}
                                    {analysisResult.statementDate && (
                                        <p><span className="font-medium">Fecha:</span> {analysisResult.statementDate}</p>
                                    )}
                                </div>
                            </div>

                            {/* Saldos */}
                            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
                                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Saldos</h4>
                                <div className="space-y-1 text-sm">
                                    {analysisResult.totalBalance !== null && (
                                        <p><span className="font-medium">Saldo Actual:</span> ${analysisResult.totalBalance?.toLocaleString()}</p>
                                    )}
                                    {analysisResult.previousBalance !== null && (
                                        <p>
                                            <span className="font-medium">Saldo Anterior:</span> 
                                            <span className={`ml-2 ${analysisResult.previousBalance >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                ${analysisResult.previousBalance >= 0 ? '+' : ''}{analysisResult.previousBalance?.toLocaleString()}
                                            </span>
                                            <span className="ml-2 text-sm text-gray-600">
                                                ({analysisResult.previousBalance >= 0 ? 'deuda' : 'saldo a favor'})
                                            </span>
                                        </p>
                                    )}
                                    {analysisResult.creditLimit !== null && (
                                        <p><span className="font-medium">Límite:</span> ${analysisResult.creditLimit?.toLocaleString()}</p>
                                    )}
                                    {analysisResult.availableCredit !== null && (
                                        <p><span className="font-medium">Disponible:</span> ${analysisResult.availableCredit?.toLocaleString()}</p>
                                    )}
                                </div>
                            </div>

                            {/* Pagos */}
                            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
                                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Pagos</h4>
                                <div className="space-y-1 text-sm">
                                    {analysisResult.minimumPayment !== null && (
                                        <p><span className="font-medium">Pago Mínimo:</span> ${analysisResult.minimumPayment?.toLocaleString()}</p>
                                    )}
                                    {analysisResult.dueDate && (
                                        <p><span className="font-medium">Fecha Límite:</span> {analysisResult.dueDate}</p>
                                    )}
                                    {analysisResult.payments !== null && (
                                        <p><span className="font-medium">Pagos:</span> ${analysisResult.payments?.toLocaleString()}</p>
                                    )}
                                </div>
                            </div>

                            {/* Cargos */}
                            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
                                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Cargos</h4>
                                <div className="space-y-1 text-sm">
                                    {analysisResult.charges !== null && (
                                        <p><span className="font-medium">Nuevos Cargos:</span> ${analysisResult.charges?.toLocaleString()}</p>
                                    )}
                                    {analysisResult.interest !== null && (
                                        <p><span className="font-medium">Intereses:</span> ${analysisResult.interest?.toLocaleString()}</p>
                                    )}
                                    {analysisResult.fees !== null && (
                                        <p><span className="font-medium">Comisiones:</span> ${analysisResult.fees?.toLocaleString()}</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Resumen de categorías */}
                        {analysisResult.transactions && analysisResult.transactions.length > 0 && (() => {
                            // Calcular estadísticas de categorías
                            const categoryStats = {};
                            let totalGastos = 0;
                            
                            analysisResult.transactions.forEach(transaction => {
                                if (transaction.type === 'cargo' && transaction.amount > 0) {
                                    const category = transaction.category || 'other';
                                    const categoryData = transaction.categoryData;
                                    
                                    if (!categoryStats[category]) {
                                        categoryStats[category] = {
                                            ...categoryData,
                                            amount: 0,
                                            count: 0
                                        };
                                    }
                                    
                                    categoryStats[category].amount += transaction.amount;
                                    categoryStats[category].count++;
                                    totalGastos += transaction.amount;
                                }
                            });
                            
                            const sortedCategories = Object.values(categoryStats)
                                .sort((a, b) => b.amount - a.amount)
                                .slice(0, 5); // Top 5 categorías
                            
                            return sortedCategories.length > 0 && (
                                <div className="mt-6">
                                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
                                        Gastos por Categoría
                                    </h4>
                                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {sortedCategories.map((category, index) => {
                                                const percentage = totalGastos > 0 ? (category.amount / totalGastos) * 100 : 0;
                                                return (
                                                    <div key={index} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded">
                                                        <div className="flex items-center space-x-2">
                                                            <span className="text-lg">{category.icon}</span>
                                                            <span className="text-sm font-medium">{category.name}</span>
                                                            <span className="text-xs text-gray-500">({category.count})</span>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-sm font-semibold">
                                                                ${category.amount.toLocaleString()}
                                                            </div>
                                                            <div className="text-xs text-gray-500">
                                                                {percentage.toFixed(1)}%
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        {totalGastos > 0 && (
                                            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                                                <div className="flex justify-between text-sm font-semibold">
                                                    <span>Total Gastos:</span>
                                                    <span>${totalGastos.toLocaleString()}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Transacciones */}
                        {analysisResult.transactions && analysisResult.transactions.length > 0 && (
                            <div className="mt-6">
                                <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
                                    Transacciones ({analysisResult.transactions.length})
                                </h4>
                                <div className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden">
                                    <div className="max-h-60 overflow-y-auto">
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-50 dark:bg-gray-700">
                                                <tr>
                                                    <th className="px-4 py-2 text-left">Fecha</th>
                                                    <th className="px-4 py-2 text-left">Descripción</th>
                                                    <th className="px-4 py-2 text-right">Monto</th>
                                                    <th className="px-4 py-2 text-center">Categoría</th>
                                                    <th className="px-4 py-2 text-center">Tipo</th>
                                                    <th className="px-4 py-2 text-center">Acciones</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {analysisResult.transactions.map((transaction, index) => (
                                                    <tr key={index} className="border-t dark:border-gray-600">
                                                        <td className="px-4 py-2">{transaction.date}</td>
                                                        <td className="px-4 py-2 truncate max-w-32" title={transaction.description}>
                                                            {transaction.description}
                                                        </td>
                                                        <td className="px-4 py-2 text-right">
                                                            ${transaction.amount?.toLocaleString()}
                                                        </td>
                                                        <td className="px-4 py-2 text-center">
                                                            {transaction.categoryData ? (
                                                                <span 
                                                                    className="px-2 py-1 rounded text-xs text-white"
                                                                    style={{ backgroundColor: transaction.categoryData.color }}
                                                                    title={`${transaction.categoryData.name} (${transaction.categoryMethod})`}
                                                                >
                                                                    {transaction.categoryData.icon} {transaction.categoryData.name}
                                                                </span>
                                                            ) : (
                                                                <span className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-800">
                                                                    ❓ Sin categoría
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-2 text-center">
                                                            <span className={`px-2 py-1 rounded text-xs ${
                                                                transaction.type === 'pago' 
                                                                    ? 'bg-green-100 text-green-800' 
                                                                    : transaction.type === 'cargo'
                                                                    ? 'bg-red-100 text-red-800'
                                                                    : 'bg-gray-100 text-gray-800'
                                                            }`}>
                                                                {transaction.type}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-2 text-center">
                                                            {transaction.type === 'cargo' && (
                                                                <button
                                                                    onClick={() => handleCategoryCorrection(transaction)}
                                                                    className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-xs px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                                                    title="Corregir categoría"
                                                                >
                                                                    {transaction.categoryMethod === 'user_pattern' ? '✏️ Editar' : '🤖 Corregir'}
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Modal de corrección de categoría */}
                <CategoryCorrectionModal
                    isOpen={correctionModal.isOpen}
                    onClose={() => setCorrectionModal({ isOpen: false, transaction: null })}
                    transaction={correctionModal.transaction}
                    db={db}
                    user={user}
                    appId={appId}
                    onCorrectionSaved={handleCorrectionSaved}
                />

                {/* Modal de creación/vinculación de tarjetas */}
                <CardCreationModal
                    isOpen={cardCreationModal.isOpen}
                    onClose={() => setCardCreationModal({ 
                        isOpen: false, 
                        suggestions: null, 
                        analysisData: null, 
                        pendingAnalysis: null 
                    })}
                    suggestions={cardCreationModal.suggestions}
                    analysisData={cardCreationModal.analysisData}
                    onCreateNew={handleCreateNewCard}
                    onLinkExisting={handleLinkExistingCard}
                />

                {/* Notificación no intrusiva */}
                {notification.show && (
                    <div className="fixed top-4 right-4 z-50 max-w-md">
                        <div className={`rounded-lg shadow-lg p-4 ${
                            notification.type === 'success' 
                                ? 'bg-green-50 border border-green-200' 
                                : notification.type === 'error'
                                ? 'bg-red-50 border border-red-200'
                                : 'bg-blue-50 border border-blue-200'
                        } transform transition-all duration-300 ease-in-out`}>
                            <div className="flex items-start">
                                <div className="flex-shrink-0">
                                    {notification.type === 'success' && (
                                        <svg className="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                        </svg>
                                    )}
                                    {notification.type === 'error' && (
                                        <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                        </svg>
                                    )}
                                </div>
                                <div className="ml-3 flex-1">
                                    <h3 className={`text-sm font-medium ${
                                        notification.type === 'success' 
                                            ? 'text-green-800' 
                                            : notification.type === 'error'
                                            ? 'text-red-800'
                                            : 'text-blue-800'
                                    }`}>
                                        {notification.title}
                                    </h3>
                                    <p className={`mt-1 text-sm ${
                                        notification.type === 'success' 
                                            ? 'text-green-700' 
                                            : notification.type === 'error'
                                            ? 'text-red-700'
                                            : 'text-blue-700'
                                    }`}>
                                        {notification.message}
                                    </p>
                                    {notification.action && (
                                        <div className="mt-3">
                                            <button
                                                onClick={notification.action.action}
                                                className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                                                    notification.type === 'success'
                                                        ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                                        : notification.type === 'error'
                                                        ? 'bg-red-100 text-red-800 hover:bg-red-200'
                                                        : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                                                }`}
                                            >
                                                {notification.action.text}
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div className="ml-4 flex-shrink-0">
                                    <button
                                        onClick={() => setNotification(prev => ({ ...prev, show: false }))}
                                        className={`rounded-md inline-flex ${
                                            notification.type === 'success' 
                                                ? 'text-green-400 hover:text-green-500' 
                                                : notification.type === 'error'
                                                ? 'text-red-400 hover:text-red-500'
                                                : 'text-blue-400 hover:text-blue-500'
                                        } focus:outline-none`}
                                    >
                                        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PDFStatementAnalyzer;