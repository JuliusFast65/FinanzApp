// Utilidad para detectar tarjetas duplicadas y encontrar coincidencias
// Evita la creación automática de tarjetas duplicadas

/**
 * Encuentra tarjetas potencialmente duplicadas basado en múltiples criterios
 * @param {Array} existingCards - Tarjetas existentes del usuario
 * @param {Object} analysisData - Datos extraídos del estado de cuenta
 * @returns {Object} Resultado del análisis de duplicados
 */
export const findPotentialDuplicates = (existingCards, analysisData) => {
    console.log('🔍 findPotentialDuplicates iniciado');
    console.log('📋 Tarjetas recibidas:', existingCards?.length || 0);
    console.log('📄 Datos de análisis recibidos:', {
        bankName: analysisData?.bankName,
        lastFourDigits: analysisData?.lastFourDigits,
        cardHolderName: analysisData?.cardHolderName,
        creditLimit: analysisData?.creditLimit
    });
    
    if (!existingCards || !Array.isArray(existingCards) || existingCards.length === 0) {
        console.log('⚠️ No hay tarjetas existentes para comparar');
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

        console.log(`🔍 Comparando con tarjeta "${card.name}":`, {
            cardBank: normalizedCard.bank,
            cardLastFour: normalizedCard.lastFour,
            analysisBank: normalizedAnalysis.bank,
            analysisLastFour: normalizedAnalysis.lastFour,
            matchScore
        });

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

    // Determinar si hay duplicados y si es seguro crear
    result.hasDuplicates = result.exactMatches.length > 0 || result.strongMatches.length > 0;
    result.canCreateSafely = result.exactMatches.length === 0 && result.strongMatches.length === 0;

    console.log('📊 Resultado análisis duplicados:', {
        hasDuplicates: result.hasDuplicates,
        canCreateSafely: result.canCreateSafely,
        exactMatches: result.exactMatches.length,
        strongMatches: result.strongMatches.length,
        possibleMatches: result.possibleMatches.length
    });

    return result;
};

/**
 * Normaliza datos de tarjeta para comparación
 */
const normalizeCardData = (data) => {
    if (!data) {
        console.log('⚠️ normalizeCardData: datos vacíos');
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

    const normalized = {
        bank: normalizeString(bankName),
        lastFour: extractLastFour(lastFourDigits),
        holderName: normalizeString(data.cardHolderName || data.holderName || data.holder || ''),
        limit: parseFloat(data.creditLimit || data.limit || data.creditLimit || 0),
        type: normalizeString(data.type || data.cardType || 'credit')
    };

    console.log('🔧 Datos normalizados:', {
        original: {
            name: data.name,
            bankName: data.bankName,
            bank: data.bank,
            issuer: data.issuer,
            lastFourDigits: data.lastFourDigits,
            cardNumber: data.cardNumber,
            number: data.number,
            cardHolderName: data.cardHolderName,
            holderName: data.holderName,
            holder: data.holder,
            creditLimit: data.creditLimit,
            limit: data.limit
        },
        normalized
    });

    return normalized;
};

/**
 * Normaliza strings para comparación
 */
const normalizeString = (str) => {
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
const extractLastFour = (input) => {
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

    // 1. Comparación de últimos 4 dígitos (peso: 40 puntos)
    if (card1.lastFour && card2.lastFour && card1.lastFour === card2.lastFour) {
        score.details.lastFourMatch = 40;
        score.reasons.push(`Últimos 4 dígitos coinciden: ${card1.lastFour}`);
    } else if (card1.lastFour && card2.lastFour) {
        score.details.lastFourMatch = 0;
        score.reasons.push(`Últimos 4 dígitos diferentes: ${card1.lastFour} vs ${card2.lastFour}`);
    }

    // 2. Comparación de banco (peso: 30 puntos)
    const bankSimilarity = calculateStringSimilarity(card1.bank, card2.bank);
    if (bankSimilarity >= 0.9) {
        score.details.bankMatch = 30;
        score.reasons.push(`Banco muy similar: "${card1.bank}" ≈ "${card2.bank}"`);
    } else if (bankSimilarity >= 0.7) {
        score.details.bankMatch = 20;
        score.reasons.push(`Banco parcialmente similar: "${card1.bank}" ≈ "${card2.bank}"`);
    } else {
        score.details.bankMatch = 0;
        score.reasons.push(`Banco diferente: "${card1.bank}" vs "${card2.bank}"`);
    }

    // 3. Comparación de titular (peso: 20 puntos)
    if (card1.holderName && card2.holderName) {
        const nameSimilarity = calculateStringSimilarity(card1.holderName, card2.holderName);
        if (nameSimilarity >= 0.8) {
            score.details.nameMatch = 20;
            score.reasons.push(`Titular similar: "${card1.holderName}" ≈ "${card2.holderName}"`);
        } else if (nameSimilarity >= 0.5) {
            score.details.nameMatch = 10;
            score.reasons.push(`Titular parcialmente similar`);
        }
    }

    // 4. Comparación de límite (peso: 10 puntos)
    if (card1.limit && card2.limit && card1.limit > 0 && card2.limit > 0) {
        const limitDifference = Math.abs(card1.limit - card2.limit) / Math.max(card1.limit, card2.limit);
        if (limitDifference <= 0.05) { // Diferencia menor al 5%
            score.details.limitMatch = 10;
            score.reasons.push(`Límite muy similar: $${card1.limit.toLocaleString()} ≈ $${card2.limit.toLocaleString()}`);
        } else if (limitDifference <= 0.2) { // Diferencia menor al 20%
            score.details.limitMatch = 5;
            score.reasons.push(`Límite similar`);
        }
    }

    // Calcular total
    score.total = Object.values(score.details).reduce((sum, value) => sum + (value || 0), 0);

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
export const isSafeToAutoCreate = (duplicateAnalysis, analysisData) => {
    const { canCreateSafely, exactMatches, strongMatches, possibleMatches } = duplicateAnalysis;
    
    // Criterios adicionales para auto-creación segura
    const hasMinimumData = 
        analysisData.bankName && 
        analysisData.lastFourDigits && 
        analysisData.totalBalance !== null;

    // Ser más conservadores: solo auto-crear si realmente no hay coincidencias
    const noAnyMatches = exactMatches.length === 0 && strongMatches.length === 0 && possibleMatches.length === 0;
    
    const isSafe = canCreateSafely && hasMinimumData && noAnyMatches;
    
    console.log('🔒 Evaluando si es seguro auto-crear:', {
        canCreateSafely,
        hasMinimumData,
        noAnyMatches,
        exactMatches: exactMatches.length,
        strongMatches: strongMatches.length,
        possibleMatches: possibleMatches.length,
        finalDecision: isSafe
    });

    return isSafe;
};
