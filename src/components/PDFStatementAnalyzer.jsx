import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { collection, addDoc, doc, updateDoc, getDocs } from 'firebase/firestore';
import { encryptText, decryptText } from '../utils/crypto';
import { categorizeTransactions } from '../utils/transactionCategories';
import * as pdfjsLib from 'pdfjs-dist';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Configurar el worker de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

// Configurar OpenAI
const openai = new OpenAI({
    apiKey: import.meta.env.VITE_OPENAI_API_KEY,
    dangerouslyAllowBrowser: true
});

// Configurar Gemini
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

const PDFStatementAnalyzer = ({ db, user, appId, onStatementAnalyzed }) => {
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
    const [selectedAI, setSelectedAI] = useState('gemini'); // gemini por defecto (más barato)
    const fileInputRef = useRef(null);

    // Cargar tarjetas del usuario
    useEffect(() => {
        if (db && user) {
            loadCards();
        }
    }, [db, user]);

    const loadCards = async () => {
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
            alert('Error al cargar las tarjetas. Revisa la consola para más detalles.');
        } finally {
            setIsLoadingCards(false);
        }
    };

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

    const handleFileSelect = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (file.type !== 'application/pdf') {
            alert('Por favor selecciona un archivo PDF válido.');
            return;
        }

        // Si no hay tarjeta seleccionada, la crearemos automáticamente después del análisis
        if (selectedCard) {
            // Verificar que la tarjeta seleccionada existe en la lista
            const selectedCardData = cards.find(card => card.id === selectedCard);
            if (!selectedCardData) {
                console.error('Tarjeta seleccionada no encontrada:', selectedCard);
                console.error('Tarjetas disponibles:', cards);
                alert('Error: La tarjeta seleccionada no es válida. Por favor selecciona otra tarjeta.');
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
            setAnalysisResult(result);
            
            if (result && Object.keys(result).length > 0) {
                await saveStatementData(result);
                if (onStatementAnalyzed) {
                    onStatementAnalyzed(result);
                }
            }
        } catch (error) {
            console.error('Error al analizar PDF:', error);
            alert('Error al analizar el PDF. Por favor intenta nuevamente.');
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
                    for (let i = 1; i <= Math.min(pdf.numPages, 2); i++) { // Máximo 2 páginas
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
                        
                        setAnalysisProgress(20 + (i / Math.min(pdf.numPages, 2)) * 30);
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

    // Analizar imagen con Gemini Vision
    const analyzeImageWithGemini = async (imageData) => {
        try {
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

            // Limpiar y extraer JSON
            let cleanContent = content.trim();
            if (cleanContent.startsWith('```json')) {
                cleanContent = cleanContent.replace(/```json\s*/, '').replace(/```\s*$/, '');
            }
            if (cleanContent.startsWith('```')) {
                cleanContent = cleanContent.replace(/```\s*/, '').replace(/```\s*$/, '');
            }

            const analysisData = JSON.parse(cleanContent);
            console.log('Datos extraídos con Gemini:', analysisData);
            return analysisData;
            
        } catch (error) {
            console.error('Error al analizar con Gemini:', error);
            throw error;
        }
    };

    // Analizar imagen con OpenAI Vision API
    const analyzeImageWithAI = async (imageData) => {
        try {
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

            // Limpiar y extraer JSON
            let cleanContent = content.trim();
            if (cleanContent.startsWith('```json')) {
                cleanContent = cleanContent.replace(/```json\s*/, '').replace(/```\s*$/, '');
            }
            if (cleanContent.startsWith('```')) {
                cleanContent = cleanContent.replace(/```\s*/, '').replace(/```\s*$/, '');
            }

            const analysisData = JSON.parse(cleanContent);
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
            
            // 2. Analizar la primera página (generalmente contiene la información principal)
            const mainPageImage = images[0];
            setExtractedText(`Imagen de ${images.length} página(s) generada. Analizando con IA...`);
            
            // 3. Analizar con la IA seleccionada
            const analysis = selectedAI === 'gemini' 
                ? await analyzeImageWithGemini(mainPageImage.data)
                : await analyzeImageWithAI(mainPageImage.data);
            setAnalysisProgress(90);
            
            // 4. Si hay múltiples páginas, podrían contener más transacciones
            if (images.length > 1) {
                console.log(`${images.length} páginas procesadas. Primera página analizada.`);
            }
            
            setAnalysisProgress(90);
            
            // 5. Categorizar transacciones automáticamente
            if (analysis.transactions && analysis.transactions.length > 0) {
                setExtractedText(`🔄 Categorizando ${analysis.transactions.length} transacciones con IA...`);
                console.log('Categorizando transacciones...');
                
                const categorizedTransactions = await categorizeTransactions(analysis.transactions);
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
            console.log('=== GUARDANDO ESTADO DE CUENTA ===');
            console.log('selectedCard ID:', selectedCard);
            console.log('cards array length:', cards.length);
            console.log('cards:', cards.map(c => ({ id: c.id, name: c.name })));
            
            // Buscar la tarjeta seleccionada
            let selectedCardData = cards.find(card => card.id === selectedCard);
            console.log('selectedCardData encontrada:', selectedCardData);
            
            // Si no existe la tarjeta, crearla automáticamente
            if (!selectedCardData) {
                console.log('🔄 Tarjeta no encontrada, creando automáticamente...');
                selectedCardData = await createCardFromAnalysis(analysisData);
                if (!selectedCardData) {
                    throw new Error('No se pudo crear la tarjeta automáticamente');
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
                transactions: analysisData.transactions || [],
                
                // Metadatos
                analyzedAt: new Date(),
                createdAt: new Date(),
                analysisData: analysisData // Mantener datos originales para referencia
            };

            console.log('Datos finales a guardar:', statementData);

            const statementsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'statements');
            const docRef = await addDoc(statementsRef, statementData);
            
            console.log('✅ Estado de cuenta guardado exitosamente con ID:', docRef.id);
            
            // Actualizar la tarjeta con los nuevos datos (solo si es más reciente)
            if (shouldUpdateCard) {
                await updateCardWithStatementData(selectedCardData.id, analysisData);
                console.log('✅ Tarjeta actualizada con datos más recientes');
            } else {
                console.log('⏭️ Estado de cuenta anterior - tarjeta no actualizada');
            }
            
            alert('¡Estado de cuenta analizado y guardado exitosamente!');
            
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
            alert(`Error al guardar: ${error.message}`);
        }
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

    const resetAnalysis = () => {
        setAnalysisResult(null);
        setExtractedText('');
        setPreviewImage(null);
        setFileInfo(null);
        setAnalysisProgress(0);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
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
                            className={`p-3 rounded-lg border-2 transition-all ${
                                selectedAI === 'gemini'
                                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="font-semibold text-gray-900 dark:text-white">Gemini 1.5 Flash</h3>
                                    <p className="text-xs text-gray-600 dark:text-gray-300">Gratis • Google AI</p>
                                </div>
                                <div className={`w-4 h-4 rounded-full ${
                                    selectedAI === 'gemini' ? 'bg-green-500' : 'bg-gray-300'
                                }`}></div>
                            </div>
                        </button>
                        
                        <button
                            onClick={() => setSelectedAI('openai')}
                            className={`p-3 rounded-lg border-2 transition-all ${
                                selectedAI === 'openai'
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="font-semibold text-gray-900 dark:text-white">GPT-4o</h3>
                                    <p className="text-xs text-gray-600 dark:text-gray-300">~$0.01 • OpenAI</p>
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
                            <option value="">Selecciona una tarjeta o déjala vacía para crear automáticamente</option>
                            {cards.map((card) => (
                                <option key={card.id} value={card.id}>
                                    {card.name} - {card.bank} (****{card.cardNumber.slice(-4)})
                                </option>
                            ))}
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
            </div>
        </div>
    );
};

export default PDFStatementAnalyzer;