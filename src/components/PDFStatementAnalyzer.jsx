import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { collection, addDoc, doc, updateDoc, getDocs } from 'firebase/firestore';
import { encryptText, decryptText } from '../utils/crypto';
import { categorizeTransactions } from '../utils/transactionCategories';
import { loadUserCategoryPatterns } from '../utils/userCategoryPatterns';
import { validateStatement, formatValidationResult, getConfidenceScore } from '../utils/statementValidator';
import { parseAIResponse, parseStatementResponse, parseTransactionsResponse, logParsingError } from '../utils/jsonParser';
import { findPotentialDuplicates, generateCardSuggestions, isSafeToAutoCreate } from '../utils/cardMatcher';
import { loadUserSettings } from '../utils/userSettings';
import CategoryCorrectionModal from './CategoryCorrectionModal';
import CardCreationModal from './CardCreationModal';
import * as pdfjsLib from 'pdfjs-dist';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Configurar el worker de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

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
    const [selectedAI, setSelectedAI] = useState('openai'); // openai por defecto (mejor cuota para desarrollo)
    const [userPatterns, setUserPatterns] = useState({});
    const [userSettings, setUserSettings] = useState(null);
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

    // MOVED: useEffect se movió al final después de definir todas las funciones

    const loadUserPatterns = useCallback(async () => {
        try {
            console.log('Cargando patrones personalizados del usuario...');
            const patterns = await loadUserCategoryPatterns(db, user.uid, appId);
            setUserPatterns(patterns);
            console.log('Patrones cargados:', Object.keys(patterns).length);
        } catch (error) {
            console.error('Error cargando patrones del usuario:', error);
        }
    }, [db, user, appId]);

    const loadUserSettingsData = useCallback(async () => {
        try {
            console.log('Cargando configuraciones del usuario...');
            const settings = await loadUserSettings(db, user.uid, appId);
            setUserSettings(settings);
            
            // Aplicar la IA por defecto del usuario
            if (settings.defaultAI && settings.defaultAI !== selectedAI) {
                setSelectedAI(settings.defaultAI);
                console.log('IA por defecto aplicada:', settings.defaultAI);
            }
        } catch (error) {
            console.error('Error cargando configuraciones del usuario:', error);
        }
    }, [db, user, appId, selectedAI]);

    const loadCards = useCallback(async () => {
        try {
            setIsLoadingCards(true);
            console.log('Cargando tarjetas...');
            
            const cardsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'creditCards');
            const querySnapshot = await getDocs(cardsRef);
            
            console.log('Documentos encontrados:', querySnapshot.docs.length);
            
            const cardsData = [];
            for (const doc of querySnapshot.docs) {
                const cardData = doc.data();
                console.log('Procesando tarjeta:', doc.id, cardData);
                
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
                
                console.log('Tarjeta desencriptada:', decryptedCard);
                cardsData.push(decryptedCard);
            }
            
            console.log('Todas las tarjetas cargadas:', cardsData);
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
        console.log('Seleccionando tarjeta:', cardId);
        console.log('Tarjetas disponibles:', cards.map(c => ({ id: c.id, name: c.name })));
        setSelectedCard(cardId);
        
        // Verificar que la tarjeta existe
        const foundCard = cards.find(card => card.id === cardId);
        console.log('Tarjeta encontrada:', foundCard);
        
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
                `La transacción "${transaction.description}" ahora se categorizará como "${require('../utils/transactionCategories').TRANSACTION_CATEGORIES[newCategory]?.name}" en el futuro.`,
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
            loadUserSettingsData();
        }
    }, [db, user, appId, loadCards, loadUserPatterns, loadUserSettingsData]);

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
            console.log('Procesando archivo con tarjeta:', selectedCardData.name);
        } else {
            console.log('Sin tarjeta seleccionada - se creará automáticamente desde el PDF');
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
            console.log('🔍 [DEBUG] Resultado crudo de analyzePDF:', {
                previousBalance: result?.previousBalance,
                totalBalance: result?.totalBalance,
                minimumPayment: result?.minimumPayment,
                transactionsCount: result?.transactions?.length || 0,
                fullResult: result
            });
            
            // Completar datos faltantes antes de mostrar y validar
            const enrichedResult = await enrichAnalysisResult(result);
            console.log('🔍 [DEBUG] Resultado después de enriquecimiento:', {
                previousBalance: enrichedResult?.previousBalance,
                totalBalance: enrichedResult?.totalBalance,
                minimumPayment: enrichedResult?.minimumPayment,
                transactionsCount: enrichedResult?.transactions?.length || 0
            });
            setAnalysisResult(enrichedResult);
            
            if (enrichedResult && Object.keys(enrichedResult).length > 0) {
                console.log('🎯 Análisis exitoso, procediendo a validar:', enrichedResult);
                
                // Debug: verificar qué campos tiene el result para la validación
                console.log('🔍 Campos disponibles para validación:', {
                    totalBalance: enrichedResult.totalBalance,
                    previousBalance: enrichedResult.previousBalance,
                    minimumPayment: enrichedResult.minimumPayment,
                    dueDate: enrichedResult.dueDate,
                    statementDate: enrichedResult.statementDate,
                    transactions: enrichedResult.transactions?.length || 0
                });
                
                // Validar la consistencia de los datos extraídos
                const validation = validateStatement(enrichedResult);
                const formattedValidation = formatValidationResult(validation);
                const confidenceScore = getConfidenceScore(validation);
                
                console.log('🔍 Resultado de validación:', validation);
                console.log('📊 Puntuación de confianza:', confidenceScore);
                
                setValidationResult({
                    ...formattedValidation,
                    confidenceScore,
                    rawValidation: validation
                });
                setShowValidation(true);
                
                console.log('💾 Procediendo a guardar:', result);
                await saveStatementData(result);
                console.log('💾 saveStatementData completado');
                
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
            // Detectar si es un error de cuota
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
            
            const prompt = `Analiza este estado de cuenta de tarjeta de crédito y extrae la siguiente información en formato JSON estricto:

{
  "totalBalance": número_decimal,
  "minimumPayment": número_decimal,
  "dueDate": "YYYY-MM-DD",
  "creditLimit": número_decimal,
  "availableCredit": número_decimal,
  "previousBalance": número_decimal,
  "payments": número_decimal,
  "charges": número_decimal,
  "fees": número_decimal,
  "interest": número_decimal,
  "bankName": "string",
  "cardHolderName": "string",
  "lastFourDigits": "1234",
  "statementDate": "YYYY-MM-DD",
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "string",
      "amount": número_decimal,
      "type": "cargo|pago|ajuste"
    }
  ]
}

INSTRUCCIONES:
- Devuelve SOLO el JSON, sin texto adicional
- Si un campo no está visible, usa null
- Para montos usa números decimales sin símbolos
- Las fechas en formato YYYY-MM-DD
- Busca información en toda la página`;

            const imagePart = {
                inlineData: {
                    data: base64Data,
                    mimeType: "image/png"
                }
            };

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
            
            console.log('Datos extraídos con Gemini:', analysisData);
            return analysisData;
            
        } catch (error) {
            console.error('Error al analizar con Gemini:', error);
            throw error;
        }
    };

    // Analizar página adicional solo para transacciones
    const analyzePageForTransactions = async (imageData, pageNumber) => {
        try {
            console.log(`🔍 Analizando página ${pageNumber} para transacciones...`);
            
            // Usar la IA seleccionada para extraer solo transacciones
            const transactions = selectedAI === 'gemini'
                ? await analyzePageTransactionsWithGemini(imageData, pageNumber)
                : await analyzePageTransactionsWithAI(imageData, pageNumber);
                
            return transactions || [];
        } catch (error) {
            console.error(`Error analizando página ${pageNumber} para transacciones:`, error);
            return [];
        }
    };

    // Analizar página con Gemini solo para transacciones
    const analyzePageTransactionsWithGemini = async (imageData, pageNumber) => {
        try {
            if (!genAI) {
                throw new Error('Gemini API no está configurada');
            }
            
            const base64Data = imageData.split(',')[1];
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            
            const prompt = `Analiza esta página ${pageNumber} de un estado de cuenta de tarjeta de crédito y extrae SOLO las transacciones en formato JSON estricto:

[
  {
    "date": "YYYY-MM-DD",
    "description": "descripción_transacción",
    "amount": número_decimal,
    "type": "cargo|pago|ajuste"
  }
]

INSTRUCCIONES:
- Devuelve SOLO el array JSON de transacciones, sin texto adicional
- NO incluyas resúmenes, saldos o información general, SOLO transacciones individuales
- Si no hay transacciones en esta página, devuelve un array vacío: []
- Para montos usa números decimales sin símbolos
- Las fechas en formato YYYY-MM-DD
- Busca movimientos, compras, pagos, cargos, etc.`;

            const imagePart = {
                inlineData: {
                    data: base64Data,
                    mimeType: "image/png"
                }
            };

            const result = await model.generateContent([prompt, imagePart]);
            const response = await result.response;
            const content = response.text();
            
            console.log(`Respuesta Gemini página ${pageNumber}:`, content);
            const transactions = parseTransactionsResponseLocal(content);
            console.log(`Transacciones extraídas página ${pageNumber}:`, transactions);
            
            return transactions;
        } catch (error) {
            console.error(`Error con Gemini página ${pageNumber}:`, error);
            return [];
        }
    };

    // Analizar página con OpenAI solo para transacciones
    const analyzePageTransactionsWithAI = async (imageData, pageNumber) => {
        try {
            if (!openai) {
                throw new Error('OpenAI API no está configurada');
            }
            
            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: `Analiza esta página ${pageNumber} de un estado de cuenta de tarjeta de crédito y extrae SOLO las transacciones en formato JSON estricto:

[
  {
    "date": "YYYY-MM-DD",
    "description": "descripción_transacción",
    "amount": número_decimal,
    "type": "cargo|pago|ajuste"
  }
]

INSTRUCCIONES:
- Devuelve SOLO el array JSON de transacciones, sin texto adicional
- NO incluyas resúmenes, saldos o información general, SOLO transacciones individuales
- Si no hay transacciones en esta página, devuelve un array vacío: []
- Para montos usa números decimales (ej: 1234.56)
- Las fechas en formato YYYY-MM-DD
- Los montos negativos indican pagos/créditos
- Busca movimientos, compras, pagos, cargos, etc.`
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
                max_tokens: 1500,
                temperature: 0.1
            });

            const content = response.choices[0].message.content;
            console.log(`Respuesta OpenAI página ${pageNumber}:`, content);
            
            const transactions = parseTransactionsResponseLocal(content);
            console.log(`Transacciones extraídas página ${pageNumber}:`, transactions);
            
            return transactions;
        } catch (error) {
            console.error(`Error con OpenAI página ${pageNumber}:`, error);
            return [];
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
            
            console.log(`✅ ${transactions.length} transacciones parseadas exitosamente`);
            return transactions;
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
            
            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: `Analiza este estado de cuenta de tarjeta de crédito y extrae la siguiente información en formato JSON estricto. Busca cuidadosamente todos los campos:

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
  "statementDate": "YYYY-MM-DD" (fecha del estado de cuenta),
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "descripción_transacción",
      "amount": número_decimal,
      "type": "cargo|pago|ajuste"
    }
  ]
}

INSTRUCCIONES IMPORTANTES:
- Devuelve SOLO el JSON, sin texto adicional
- Si un campo no está visible, usa null
- Para montos usa números decimales (ej: 1234.56, no "$1,234.56")
- Para fechas usa formato YYYY-MM-DD
- Los montos negativos indican pagos/créditos
- Lee cuidadosamente todos los números y fechas
- Busca información en toda la página, no solo en el resumen`
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
            
            console.log('Datos extraídos:', analysisData);
            return analysisData;
            
        } catch (error) {
            console.error('Error al analizar con OpenAI:', error);
            throw error;
        }
    };

    // Función principal de análisis
    const analyzePDF = async (file) => {
        try {
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
                            additionalTransactions.push(...pageTransactions);
                        } else {
                            console.log(`⚪ Página ${pageNum}: No se encontraron transacciones`);
                        }
                    } catch (pageError) {
                        console.error(`❌ Error analizando página ${pageNum}:`, pageError);
                        // Continuar con las siguientes páginas
                    }
                    
                    setAnalysisProgress(60 + ((i + 1) / images.length) * 25);
                }
                
                // Combinar transacciones de todas las páginas
                if (additionalTransactions.length > 0) {
                    console.log(`🔄 Combinando ${additionalTransactions.length} transacciones adicionales con ${analysis.transactions?.length || 0} de la primera página`);
                    analysis.transactions = [...(analysis.transactions || []), ...additionalTransactions];
                    
                    // Eliminar duplicados basados en fecha y descripción
                    analysis.transactions = analysis.transactions.filter((transaction, index, self) => 
                        index === self.findIndex(t => 
                            t.date === transaction.date && t.description === transaction.description && t.amount === transaction.amount
                        )
                    );
                    
                    console.log(`✅ Total de transacciones después de combinar y deduplicar: ${analysis.transactions.length}`);
                }
            }
            
            setAnalysisProgress(85);
            
            // 5. Categorizar transacciones automáticamente
            if (analysis.transactions && analysis.transactions.length > 0) {
                setExtractedText(`🔄 Categorizando ${analysis.transactions.length} transacciones con IA...`);
                console.log('Categorizando transacciones...');
                
                const categorizedTransactions = await categorizeTransactions(analysis.transactions, userPatterns, userSettings);
                analysis.transactions = categorizedTransactions;
                
                console.log('Transacciones categorizadas:', categorizedTransactions);
            }
            
            setAnalysisProgress(100);
            setExtractedText(`✅ Análisis completado con IA. ${images.length} página(s) procesada(s). ${analysis.transactions?.length || 0} transacciones categorizadas.`);
            
            return analysis;
            
        } catch (error) {
            console.error('Error en análisis:', error);
            setExtractedText(`❌ Error en análisis: ${error.message}`);
            throw error;
        }
    };

    const saveStatementData = async (analysisData) => {
        try {
            console.log('🚀 === INICIANDO GUARDADO DE ESTADO DE CUENTA ===');
            console.log('📥 Datos recibidos para guardar:', analysisData);
            console.log('selectedCard ID:', selectedCard);
            console.log('cards array length:', cards.length);
            console.log('cards:', cards.map(c => ({ id: c.id, name: c.name })));
            
            // Buscar la tarjeta seleccionada
            let selectedCardData = cards.find(card => card.id === selectedCard);
            console.log('selectedCardData encontrada:', selectedCardData);
            
            // Si no existe la tarjeta, usar lógica inteligente para detectar duplicados
            if (!selectedCardData) {
                console.log('🔄 Tarjeta no encontrada, analizando duplicados...');
                selectedCardData = await handleMissingCard(analysisData);
                if (!selectedCardData) {
                    // Pausar el guardado hasta que el usuario confirme
                    return { pending: true, message: 'Esperando confirmación del usuario para crear tarjeta' };
                }
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
                const encryptedTransactions = await Promise.all(
                    analysisData.transactions.map(async (transaction) => ({
                        ...transaction,
                        description: await encryptText(transaction.description || '', user.uid)
                    }))
                );
                statementData.transactions = encryptedTransactions;
                console.log('✅ Transacciones encriptadas:', encryptedTransactions.length);
            }

            console.log('Datos finales a guardar:', statementData);

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
                await updateCardWithStatementData(selectedCardData.id, analysisData);
                console.log('✅ Tarjeta actualizada con datos más recientes');
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
        
        // Buscar duplicados potenciales
        const duplicateAnalysis = findPotentialDuplicates(cards, analysisData);
        const suggestions = generateCardSuggestions(duplicateAnalysis);
        
        console.log('📊 Análisis de duplicados:', duplicateAnalysis);
        console.log('💡 Sugerencias generadas:', suggestions);
        
        // Si es seguro crear automáticamente, hacerlo sin confirmación
        if (isSafeToAutoCreate(duplicateAnalysis, analysisData)) {
            console.log('✅ Es seguro crear automáticamente');
            showNotification(
                'info',
                '🤖 Creando Tarjeta Automáticamente',
                'No se encontraron tarjetas similares. Creando nueva tarjeta...',
                3000
            );
            return await createCardFromAnalysis(analysisData);
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

            const isNewer = newStatementDate >= lastStatementDate;
            
            console.log('Comparación de fechas:', {
                nuevaFecha: analysisData.statementDate,
                fechaActual: cardData.lastStatementDate,
                esMasReciente: isNewer
            });

            return isNewer;
            
        } catch (error) {
            console.error('Error al validar fechas:', error);
            // En caso de error, mejor no actualizar
            return false;
        }
    };

    // Actualizar tarjeta con datos del estado de cuenta
    const updateCardWithStatementData = async (cardId, analysisData) => {
        try {
            console.log('Actualizando tarjeta con datos del análisis...');
            
            const cardRef = doc(db, 'artifacts', appId, 'users', user.uid, 'creditCards', cardId);
            
            const updateData = {
                // Actualizar saldo actual
                currentBalance: analysisData.totalBalance || 0,
                
                // Actualizar límite si está disponible
                ...(analysisData.creditLimit && { limit: analysisData.creditLimit }),
                
                // Actualizar fechas importantes
                ...(analysisData.dueDate && { dueDate: analysisData.dueDate }),
                
                // Actualizar fecha del último estado de cuenta procesado
                lastStatementDate: analysisData.statementDate || new Date().toISOString().split('T')[0],
                
                // Metadatos
                lastUpdated: new Date(),
                lastAnalyzedAt: new Date()
            };
            
            console.log('Actualizando tarjeta con datos:', updateData);
            await updateDoc(cardRef, updateData);
            
            console.log('✅ Tarjeta actualizada exitosamente');
            
        } catch (error) {
            console.error('Error al actualizar tarjeta:', error);
            // No fallar si no se puede actualizar la tarjeta
        }
    };

    // Función para enriquecer el resultado del análisis con datos faltantes
    const enrichAnalysisResult = async (result) => {
        console.log('🔧 Enriqueciendo resultado del análisis...');
        
        if (!result) return result;
        
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
                    console.log(`✅ [UI] Saldo anterior encontrado: $${Math.abs(amount)} en "${transaction.description}"`);
                    return Math.abs(amount);
                }
            }
            
            // Si la primera transacción es un tipo específico y tiene monto significativo
            if (i === 0 && transaction.type === 'saldo_anterior' && transaction.amount) {
                const amount = parseFloat(transaction.amount);
                if (!isNaN(amount)) {
                    console.log(`✅ [UI] Saldo anterior por tipo: $${Math.abs(amount)}`);
                    return Math.abs(amount);
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

            console.log('✅ Usuario confirmó crear nueva tarjeta');
            const newCard = await createCardFromAnalysis(pendingAnalysis);
            
            if (newCard) {
                // Recargar tarjetas para incluir la nueva
                await loadCards();
                
                // Continuar con el guardado del statement
                setSelectedCard(newCard.id);
                setTimeout(async () => {
                    await saveStatementData(pendingAnalysis);
                }, 100);
                
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

            console.log('🔗 Usuario eligió vincular con tarjeta existente:', existingCard.name);
            
            // Usar la tarjeta existente
            setSelectedCard(existingCard.id);
            
            // Continuar con el guardado del statement
            setTimeout(async () => {
                await saveStatementData(pendingAnalysis);
            }, 100);
            
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
                    
                    {/* Información sobre cuotas */}
                    <div className="text-xs text-gray-600 dark:text-gray-400 bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg border border-yellow-200 dark:border-yellow-800 mb-4">
                        <p className="font-medium mb-1">💡 Información de Cuotas:</p>
                        <p><strong>Gemini:</strong> 15 requests/min, 1,500/día (gratis)</p>
                        <p><strong>OpenAI:</strong> Mayor cuota disponible (requiere saldo)</p>
                        <p><strong>Tip:</strong> Si aparece error de cuota, espera 1-2 minutos o cambia de IA</p>
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

                {/* Información del archivo */}
                {fileInfo && (
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
                {previewImage && (
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
                {extractedText && (
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                            Estado del Análisis
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-300">{extractedText}</p>
                    </div>
                )}

                {/* Componente de Validación */}
                {showValidation && validationResult && (
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
                {analysisResult && (
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
                                        <p><span className="font-medium">Saldo Anterior:</span> ${analysisResult.previousBalance?.toLocaleString()}</p>
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
                                                onClick={notification.action.onClick}
                                                className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                                                    notification.type === 'success'
                                                        ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                                        : notification.type === 'error'
                                                        ? 'bg-red-100 text-red-800 hover:bg-red-200'
                                                        : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                                                }`}
                                            >
                                                {notification.action.label}
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