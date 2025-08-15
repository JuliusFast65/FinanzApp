// Utilidad para detectar tarjetas duplicadas y encontrar coincidencias
// Evita la creación automática de tarjetas duplicadas
// 
// NOTA: El límite de crédito NO se considera para la vinculación de tarjetas
// Solo se usan: banco, últimos 4 dígitos y nombre del titular

/**
 * Encuentra tarjetas potencialmente duplicadas basado en múltiples criterios
 * @param {Array} existingCards - Tarjetas existentes del usuario
 * @param {Object} analysisData - Datos extraídos del estado de cuenta
 * @returns {Object} Resultado del análisis de duplicados
 */
export const findPotentialDuplicates = (existingCards, analysisData) => {
    // console.log('🔍 findPotentialDuplicates iniciado');
    // console.log('📋 Tarjetas recibidas:', existingCards?.length || 0);
    // console.log('📄 Datos de análisis recibidos:', {
    //     bankName: analysisData?.bankName,
    //     lastFourDigits: analysisData?.lastFourDigits,
    //     cardHolderName: analysisData?.cardHolderName,
    //     creditLimit: analysisData?.creditLimit
    // });
    
    if (!existingCards || !Array.isArray(existingCards) || existingCards.length === 0) {
        // console.log('⚠️ No hay tarjetas existentes para comparar');
        return {
            hasDuplicates: false,
            exactMatches: [],
            strongMatches: [],
            possibleMatches: [],
            canCreateSafely: true
        };
    }

    const result = {
        hasDuplicates: false,
        exactMatches: [],
        strongMatches: [],
        possibleMatches: [],
        canCreateSafely: false,
        analysisData
    };

    // Normalizar datos del análisis
    const normalizedAnalysis = normalizeCardData(analysisData);

    for (const card of existingCards) {
        const normalizedCard = normalizeCardData(card);
        const matchScore = calculateMatchScore(normalizedCard, normalizedAnalysis);

        // console.log(`🔍 Comparando con tarjeta "${card.name}":`, {
        //     cardBank: normalizedCard.bank,
        //     cardLastFour: normalizedCard.lastFour,
        //     cardHolder: normalizedCard.holderName,
        //     analysisBank: normalizedAnalysis.bank,
        //     analysisLastFour: normalizedAnalysis.lastFour,
        //     analysisHolder: normalizedAnalysis.holderName,
        //     matchScore
        // });

        if (matchScore.total >= 90) {
            result.exactMatches.push({
                card,
                matchScore,
                reasons: matchScore.reasons
            });
        } else if (matchScore.total >= 70) {
            result.strongMatches.push({
                card,
                matchScore,
                reasons: matchScore.reasons
            });
        } else if (matchScore.total >= 40) {
            result.possibleMatches.push({
                card,
                matchScore,
                reasons: matchScore.reasons
            });
        }
    }

    // 🔒 NUEVA LÓGICA MÁS ESTRICTA: Considerar como duplicado si hay coincidencias fuertes
    result.hasDuplicates = result.exactMatches.length > 0 || result.strongMatches.length > 0;
    
    // 🔒 Solo es seguro crear si NO hay coincidencias fuertes o exactas
    // Esto previene la creación automática de tarjetas similares
    result.canCreateSafely = result.exactMatches.length === 0 && result.strongMatches.length === 0;
    
    // 🔒 VALIDACIÓN ADICIONAL: Si hay coincidencias posibles, también considerar como no seguro
    if (result.possibleMatches.length > 0) {
        // console.log('⚠️ Coincidencias posibles detectadas, marcando como no seguro para crear automáticamente');
        result.canCreateSafely = false;
    }

    // console.log('📊 Resultado análisis duplicados:', {
    //     hasDuplicates: result.hasDuplicates,
    //     canCreateSafely: result.canCreateSafely,
    //     exactMatches: result.exactMatches.length,
    //     strongMatches: result.strongMatches.length,
    //     possibleMatches: result.possibleMatches.length
    // });

    return result;
};

/**
 * Normaliza datos de tarjeta para comparación
 */
export const normalizeCardData = (data) => {
    if (!data) {
        // console.log('⚠️ normalizeCardData: datos vacíos');
        return {};
    }

    // Intentar múltiples fuentes para el banco
    let bankName = data.bankName || data.bank || data.issuer || '';
    
    // Si no hay banco en los campos directos, intentar extraer del nombre de la tarjeta
    if (!bankName && data.name) {
        // Extraer banco del nombre de la tarjeta (ej: "Banco XYZ - Visa")
        const bankMatch = data.name.match(/^([^-]+)/);
        if (bankMatch) {
            bankName = bankMatch[1].trim();
        }
    }
    
    // Intentar múltiples fuentes para los últimos 4 dígitos
    let lastFourDigits = data.lastFourDigits || data.cardNumber || data.number || '';
    
    // Si no hay en campos directos, intentar extraer del nombre
    if (!lastFourDigits && data.name) {
        const numberMatch = data.name.match(/(\d{4})/);
        if (numberMatch) {
            lastFourDigits = numberMatch[1];
        }
    }

    // 🔧 NUEVA LÓGICA: Intentar extraer el titular del nombre de la tarjeta si no está en campos específicos
    let holderName = data.cardHolderName || data.holderName || data.holder || '';
    
    // Si no hay titular en campos específicos, intentar extraer del nombre de la tarjeta
    if (!holderName && data.name) {
        // El nombre de la tarjeta podría ser el titular (ej: "JULIO CESAR VELOZ MORAN")
        // Solo usar si no parece ser un nombre de banco
        const nameWords = data.name.split(' ').filter(word => word.length > 0);
        if (nameWords.length >= 2 && !data.name.toLowerCase().includes('banco') && !data.name.toLowerCase().includes('visa') && !data.name.toLowerCase().includes('mastercard')) {
            holderName = data.name;
        }
    }

    const normalized = {
        bank: normalizeString(bankName),
        lastFour: extractLastFour(lastFourDigits),
        holderName: normalizeString(holderName),
        limit: parseFloat(data.creditLimit || data.limit || data.creditLimit || 0), // Solo para referencia, no usado en comparación
        type: normalizeString(data.type || data.cardType || 'credit')
    };

    // console.log('🔧 Datos normalizados:', {
    //     original: {
    //         name: data.name,
    //         bankName: data.bankName,
    //         bank: data.bank,
    //         issuer: data.issuer,
    //         lastFourDigits: data.lastFourDigits,
    //         cardNumber: data.cardNumber,
    //         number: data.number,
    //         cardHolderName: data.cardHolderName,
    //         holderName: data.holderName,
    //         holder: data.holder,
    //         creditLimit: data.creditLimit,
    //         limit: data.limit
    //     },
    //     normalized,
    //     holderNameSource: holderName === data.name ? 'name' : 
    //                       holderName === data.cardHolderName ? 'cardHolderName' :
    //                       holderName === data.holderName ? 'holderName' :
    //                       holderName === data.holder ? 'holder' : 'none'
    // });

    return normalized;
};

/**
 * Normaliza strings para comparación
 */
export const normalizeString = (str) => {
    if (!str) return '';
    return str
        .toLowerCase()
        .trim()
        .replace(/[^\w\s]/g, '') // Remover caracteres especiales
        .replace(/\s+/g, ' '); // Normalizar espacios
};

/**
 * Extrae los últimos 4 dígitos de cualquier formato
 */
export const extractLastFour = (input) => {
    if (!input) return '';
    
    // Extraer solo números
    const numbers = input.replace(/\D/g, '');
    
    // Tomar los últimos 4 dígitos
    return numbers.slice(-4);
};

/**
 * Calcula puntuación de similitud entre dos tarjetas
 */
const calculateMatchScore = (card1, card2) => {
    const score = {
        total: 0,
        reasons: [],
        details: {}
    };

    // 1. Comparación de últimos 4 dígitos (peso: 30 puntos)
    if (card1.lastFour && card2.lastFour && card1.lastFour === card2.lastFour) {
        score.details.lastFourMatch = 30;
        score.reasons.push(`Últimos 4 dígitos coinciden: ${card1.lastFour}`);
    } else if (card1.lastFour && card2.lastFour) {
        score.details.lastFourMatch = 0;
        score.reasons.push(`Últimos 4 dígitos diferentes: ${card1.lastFour} vs ${card2.lastFour}`);
    }

    // 2. Comparación de banco (peso: 35 puntos) - AUMENTADO para dar más peso al banco
    if (card1.bank === card2.bank && card1.bank && card2.bank) {
        // 🔧 NUEVA LÓGICA: Banco idéntico (después de normalización)
        score.details.bankMatch = 35;
        score.reasons.push(`Banco idéntico: "${card1.bank}"`);
    } else {
        const bankSimilarity = calculateStringSimilarity(card1.bank, card2.bank);
        if (bankSimilarity >= 0.9) {
            score.details.bankMatch = 35;
            score.reasons.push(`Banco muy similar: "${card1.bank}" ≈ "${card2.bank}"`);
        } else if (bankSimilarity >= 0.7) {
            score.details.bankMatch = 25;
            score.reasons.push(`Banco parcialmente similar: "${card1.bank}" ≈ "${card2.bank}"`);
        } else {
            score.details.bankMatch = 0;
            score.reasons.push(`Banco diferente: "${card1.bank}" vs "${card2.bank}"`);
        }
    }

    // 3. Comparación de titular (peso: 35 puntos) - AUMENTADO para detectar mejor duplicados
    if (card1.holderName && card2.holderName) {
        if (card1.holderName === card2.holderName) {
            // 🔧 NUEVA LÓGICA: Titular idéntico (después de normalización)
            score.details.nameMatch = 35;
            score.reasons.push(`Titular idéntico: "${card1.holderName}"`);
        } else {
            const nameSimilarity = calculateStringSimilarity(card1.holderName, card2.holderName);
            if (nameSimilarity >= 0.8) {
                score.details.nameMatch = 35;
                score.reasons.push(`Titular similar: "${card1.holderName}" ≈ "${card2.holderName}"`);
            } else if (nameSimilarity >= 0.5) {
                score.details.nameMatch = 20;
                score.reasons.push(`Titular parcialmente similar`);
            }
        }
    }

    // 4. Comparación de límite - DESHABILITADA
    // El límite de crédito ya no se considera para la vinculación de tarjetas
    // score.details.limitMatch = 0;
    // score.reasons.push(`Límite de crédito no considerado para vinculación`);

    // Calcular total
    score.total = Object.values(score.details).reduce((sum, value) => sum + (value || 0), 0);

    // 🔒 NUEVA REGLA: Si el banco y titular son idénticos, considerar como duplicado fuerte
    // incluso si los últimos 4 dígitos son diferentes
    if (card1.bank === card2.bank && 
        card1.holderName === card2.holderName && 
        card1.bank && card2.bank && 
        card1.holderName && card2.holderName) {
        
        if (card1.lastFour !== card2.lastFour) {
            score.total = Math.max(score.total, 75); // Mínimo 75 puntos para banco + titular idénticos
            score.reasons.push(`⚠️ ALERTA: Mismo banco y titular, pero diferentes últimos 4 dígitos - posible duplicado`);
            score.details.duplicateAlert = 75;
        }
    }

    // 🔍 LOG ADICIONAL para debugging
    // console.log('📊 Puntuación calculada:', {
    //     card1: { bank: card1.bank, holderName: card1.holderName, lastFour: card1.lastFour },
    //     card2: { bank: card2.bank, holderName: card2.holderName, lastFour: card2.lastFour },
    //     scoreDetails: score.details,
    //     totalScore: score.total,
    //     reasons: score.reasons
    // });

    return score;
};

/**
 * Calcula similitud entre strings usando algoritmo de Jaccard
 */
const calculateStringSimilarity = (str1, str2) => {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;

    // Convertir a sets de palabras
    const words1 = new Set(str1.split(' ').filter(w => w.length > 0));
    const words2 = new Set(str2.split(' ').filter(w => w.length > 0));

    // Calcular intersección y unión
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    // Similitud de Jaccard
    return intersection.size / union.size;
};

/**
 * Genera sugerencias inteligentes para el usuario
 */
export const generateCardSuggestions = (duplicateAnalysis) => {
    const { exactMatches, strongMatches, possibleMatches, canCreateSafely } = duplicateAnalysis;

    const suggestions = {
        action: 'unknown',
        title: '',
        message: '',
        options: [],
        severity: 'info'
    };

    if (exactMatches.length > 0) {
        suggestions.action = 'link_existing';
        suggestions.title = '🎯 Tarjeta Existente Detectada';
        suggestions.message = `Encontramos una tarjeta que coincide exactamente con este estado de cuenta.`;
        suggestions.severity = 'success';
        suggestions.options = [
            {
                id: 'link',
                label: `Vincular con "${exactMatches[0].card.name}"`,
                recommended: true,
                card: exactMatches[0].card
            },
            {
                id: 'create_anyway',
                label: 'Crear nueva tarjeta de todas formas',
                recommended: false
            }
        ];
    } else if (strongMatches.length > 0) {
        suggestions.action = 'confirm_similarity';
        suggestions.title = '⚠️ Posible Tarjeta Duplicada';
        suggestions.message = `Encontramos ${strongMatches.length} tarjeta(s) muy similar(es). ¿Es alguna de estas?`;
        suggestions.severity = 'warning';
        suggestions.options = strongMatches.map(match => ({
            id: 'link',
            label: `Vincular con "${match.card.name}"`,
            recommended: true,
            card: match.card,
            reasons: match.reasons
        }));
        suggestions.options.push({
            id: 'create_new',
            label: 'No, crear nueva tarjeta',
            recommended: false
        });
    } else if (possibleMatches.length > 0) {
        suggestions.action = 'suggest_review';
        suggestions.title = 'ℹ️ Tarjetas Similares Encontradas';
        suggestions.message = `Hay ${possibleMatches.length} tarjeta(s) que podrían ser similares. Revisa si alguna coincide.`;
        suggestions.severity = 'info';
        suggestions.options = possibleMatches.slice(0, 3).map(match => ({ // Máximo 3 sugerencias
            id: 'link',
            label: `¿Es "${match.card.name}"?`,
            recommended: false,
            card: match.card,
            reasons: match.reasons
        }));
        suggestions.options.push({
            id: 'create_new',
            label: 'No, crear nueva tarjeta',
            recommended: true
        });
    } else if (canCreateSafely) {
        suggestions.action = 'safe_create';
        suggestions.title = '✅ Crear Nueva Tarjeta';
        suggestions.message = 'No encontramos tarjetas similares. Es seguro crear una nueva.';
        suggestions.severity = 'success';
        suggestions.options = [
            {
                id: 'create_new',
                label: 'Crear nueva tarjeta',
                recommended: true
            }
        ];
    }

    return suggestions;
};

/**
 * Valida si es seguro crear una tarjeta automáticamente sin confirmación
 */
export const isSafeToAutoCreate = (duplicateAnalysis, analysisData, existingCards = []) => {
    // 🔒 VALIDACIÓN ROBUSTA: Verificar que los parámetros existen y son válidos
    if (!duplicateAnalysis || typeof duplicateAnalysis !== 'object') {
        console.warn('⚠️ isSafeToAutoCreate: duplicateAnalysis es inválido:', duplicateAnalysis);
        return false;
    }

    if (!analysisData || typeof analysisData !== 'object') {
        console.warn('⚠️ isSafeToAutoCreate: analysisData es inválido:', analysisData);
        return false;
    }

    const { canCreateSafely, exactMatches, strongMatches, possibleMatches } = duplicateAnalysis;
    
    // 🔒 VALIDACIÓN ESTRICTA: Solo crear si tenemos TODOS los datos críticos
    const hasCompleteData = 
        analysisData.bankName && 
        typeof analysisData.bankName === 'string' &&
        analysisData.bankName.trim() !== '' &&
        analysisData.lastFourDigits && 
        typeof analysisData.lastFourDigits === 'string' &&
        analysisData.lastFourDigits.trim() !== '' &&
        analysisData.cardHolderName && 
        typeof analysisData.cardHolderName === 'string' &&
        analysisData.cardHolderName.trim() !== '' &&
        analysisData.totalBalance !== null && 
        analysisData.totalBalance !== undefined;

    // Validar que los datos no sean valores por defecto o placeholder
    const hasValidData = 
        analysisData.bankName !== 'Banco Desconocido' &&
        analysisData.lastFourDigits !== 'xxxx' &&
        analysisData.cardHolderName !== 'Titular Principal' &&
        analysisData.lastFourDigits && 
        typeof analysisData.lastFourDigits === 'string' &&
        analysisData.lastFourDigits.length === 4 &&
        /^\d{4}$/.test(analysisData.lastFourDigits);

    // 🔓 SER MÁS INTELIGENTE: Vincular automáticamente si hay coincidencias fuertes
    const hasStrongOrExactMatches = exactMatches && Array.isArray(exactMatches) && exactMatches.length > 0 || 
                                   strongMatches && Array.isArray(strongMatches) && strongMatches.length > 0;
    const noWeakMatches = !possibleMatches || !Array.isArray(possibleMatches) || possibleMatches.length === 0; // Solo posibles coincidencias débiles
    
    // 🔒 NUEVA VALIDACIÓN: Verificar si hay tarjetas con el mismo banco y titular
    // Esto es crítico para evitar duplicados como el caso de "Banco Bolivariano" + "JULIO CESAR VELOZ MORAN"
    const hasSameBankAndHolder = exactMatches && Array.isArray(exactMatches) && exactMatches.length > 0 && 
        exactMatches.some(match => {
            const normalizedCard = normalizeCardData(match.card);
            const normalizedAnalysis = normalizeCardData(analysisData);
            
            return normalizedCard.bank === normalizedAnalysis.bank && 
                   normalizedCard.holderName === normalizedAnalysis.holderName &&
                   normalizedCard.bank && normalizedAnalysis.bank &&
                   normalizedCard.holderName && normalizedAnalysis.holderName;
        });
    
    // 🔒 VALIDACIÓN ADICIONAL: Verificar si hay tarjetas con el mismo banco y nombre (sin importar últimos 4 dígitos)
    // Esto previene crear tarjetas adicionales del mismo banco automáticamente
    const hasSameBankAndName = existingCards && Array.isArray(existingCards) && existingCards.some(card => {
        const normalizedCard = normalizeCardData(card);
        const normalizedAnalysis = normalizeCardData(analysisData);
        
        return normalizedCard.bank === normalizedAnalysis.bank && 
               normalizedCard.name === normalizedAnalysis.cardHolderName &&
               normalizedCard.bank && normalizedAnalysis.bank &&
               normalizedCard.name && normalizedAnalysis.cardHolderName;
    });
    
    // Si hay tarjetas con el mismo banco y titular, NO es seguro crear automáticamente
    if (hasSameBankAndHolder) {
        // console.log('🚨 ALERTA: Se detectaron tarjetas con el mismo banco y titular - NO es seguro crear automáticamente');
        return false;
    }
    
    // Si hay tarjetas con el mismo banco y nombre, NO es seguro crear automáticamente
    if (hasSameBankAndName) {
        // console.log('🚨 ALERTA: Se detectaron tarjetas con el mismo banco y nombre - NO es seguro crear automáticamente');
        return false;
    }
    
    // 🔒 NUEVA LÓGICA MÁS ESTRICTA: Solo crear si NO hay coincidencias
    // NO crear automáticamente si hay coincidencias fuertes o exactas
    
    // 🔒 VALIDACIÓN ADICIONAL: Verificar si hay tarjetas del mismo banco
    const hasSameBank = existingCards && Array.isArray(existingCards) && existingCards.some(card => {
        const normalizedCard = normalizeCardData(card);
        const normalizedAnalysis = normalizeCardData(analysisData);
        
        return normalizedCard.bank === normalizedAnalysis.bank && 
               normalizedCard.bank && normalizedAnalysis.bank;
    });
    
    // Si hay tarjetas del mismo banco, NO es seguro crear automáticamente
    if (hasSameBank) {
        // console.log('🚨 ALERTA: Se detectaron tarjetas del mismo banco - NO es seguro crear automáticamente');
        return false;
    }
    
    const isSafe = canCreateSafely && hasCompleteData && hasValidData && !hasStrongOrExactMatches;
    
    // console.log('🔒 Evaluando si es seguro auto-crear:', {
    //     canCreateSafely,
    //     hasCompleteData,
    //     hasValidData,
    //     hasStrongOrExactMatches,
    //     noWeakMatches,
    //     hasSameBankAndHolder,
    //     hasSameBankAndName,
    //     hasSameBank,
    //     exactMatches: exactMatches?.length || 0,
    //     strongMatches: exactMatches?.length || 0,
    //     possibleMatches: possibleMatches?.length || 0,
    //     dataQuality: {
    //         bankName: analysisData.bankName,
    //         lastFourDigits: analysisData.lastFourDigits,
    //         cardHolderName: analysisData.cardHolderName,
    //         totalBalance: analysisData.totalBalance
    //     },
    //     finalDecision: isSafe,
    //     reason: isSafe ? 'No hay coincidencias y datos completos' : 
    //             hasSameBank ? 'Hay tarjetas del mismo banco' :
    //             hasSameBankAndName ? 'Hay tarjetas con mismo banco y nombre' :
    //             hasSameBankAndHolder ? 'Hay tarjetas con mismo banco y titular' :
    //             hasStrongOrExactMatches ? 'Hay coincidencias fuertes/exactas' :
    //             !canCreateSafely ? 'No es seguro crear según análisis' :
    //             !hasCompleteData ? 'Datos incompletos' :
    //             !hasValidData ? 'Datos inválidos' : 'Otra razón'
    // });

    return isSafe;
};

/**
 * Valida si los datos del análisis son suficientes para mostrar opciones de creación de tarjeta
 */
export const hasSufficientDataForCardCreation = (analysisData) => {
    // 🔒 VALIDACIÓN ROBUSTA: Verificar que analysisData existe y es un objeto
    if (!analysisData || typeof analysisData !== 'object') {
        console.warn('⚠️ hasSufficientDataForCardCreation: analysisData es inválido:', analysisData);
        return false;
    }

    // Verificar que tengamos al menos los datos mínimos para mostrar opciones
    const hasMinimumData = 
        analysisData.bankName && 
        typeof analysisData.bankName === 'string' &&
        analysisData.bankName.trim() !== '' &&
        analysisData.lastFourDigits && 
        typeof analysisData.lastFourDigits === 'string' &&
        analysisData.lastFourDigits.trim() !== '';

    // Verificar que los datos no sean valores por defecto
    const hasValidData = 
        analysisData.bankName !== 'Banco Desconocido' &&
        analysisData.lastFourDigits !== 'xxxx' &&
        analysisData.lastFourDigits && 
        typeof analysisData.lastFourDigits === 'string' &&
        analysisData.lastFourDigits.length === 4 &&
        /^\d{4}$/.test(analysisData.lastFourDigits);

    // 🔒 NUEVA VALIDACIÓN: Verificar que el nombre del titular sea válido
    const hasValidHolderName = 
        analysisData.cardHolderName && 
        typeof analysisData.cardHolderName === 'string' &&
        analysisData.cardHolderName.trim() !== '' &&
        analysisData.cardHolderName !== 'Titular Principal' &&
        analysisData.cardHolderName.length > 3; // Al menos 3 caracteres

    // 🔒 NUEVA VALIDACIÓN: Verificar que el banco tenga un nombre válido
    const hasValidBankName = 
        analysisData.bankName && 
        typeof analysisData.bankName === 'string' &&
        analysisData.bankName.trim() !== '' &&
        analysisData.bankName !== 'Banco Desconocido' &&
        analysisData.bankName.length > 2; // Al menos 2 caracteres

    const isSufficient = hasMinimumData && hasValidData && hasValidHolderName && hasValidBankName;
    
    console.log('🔍 Evaluando si hay datos suficientes para mostrar opciones de tarjeta:', {
        hasMinimumData,
        hasValidData,
        hasValidHolderName,
        hasValidBankName,
        dataQuality: {
            bankName: analysisData.bankName,
            lastFourDigits: analysisData.lastFourDigits,
            cardHolderName: analysisData.cardHolderName,
            bankNameType: typeof analysisData.bankName,
            lastFourDigitsType: typeof analysisData.lastFourDigits,
            lastFourDigitsLength: analysisData.lastFourDigits?.length,
            holderNameLength: analysisData.cardHolderName?.length,
            bankNameLength: analysisData.bankName?.length
        },
        finalDecision: isSufficient
    });

    return isSufficient;
};
