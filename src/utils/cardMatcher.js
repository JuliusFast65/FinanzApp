/**
 * Utilidad para buscar coincidencia exacta de tarjeta
 * Busca por banco, nombre y últimos 4 dígitos
 */
export const findExactCardMatch = (existingCards, analysisData) => {
    console.log('🔍 [DEBUG] Buscando coincidencia exacta de tarjeta');
    console.log('📋 Tarjetas existentes:', existingCards?.length || 0);
    console.log('📄 Datos del estado de cuenta:', {
        bankName: analysisData?.bankName,
        lastFourDigits: analysisData?.lastFourDigits,
        cardHolderName: analysisData?.cardHolderName
    });
    
    if (!existingCards || !Array.isArray(existingCards) || existingCards.length === 0) {
        console.log('📋 No hay tarjetas existentes');
        return {
            hasExactMatch: false,
            exactMatches: [],
            canCreateSafely: true
        };
    }

    const result = {
        hasExactMatch: false,
        exactMatches: [],
        canCreateSafely: false
    };

    // Buscar coincidencia exacta: banco, nombre y últimos 4 dígitos
    for (const card of existingCards) {
        // Normalizar datos para comparación
        const normalizedCardBank = (card.bank || '').toLowerCase().trim();
        const normalizedAnalysisBank = (analysisData.bankName || '').toLowerCase().trim();
        
        const normalizedCardName = (card.name || '')
            .toLowerCase()
            .trim()
            .replace(/\s+/g, ' ');
        
        const normalizedAnalysisName = (analysisData.cardHolderName || '')
            .toLowerCase()
            .trim()
            .replace(/\s+/g, ' ');
        
        const cardLastFour = (card.cardNumber || '').slice(-4);
        const analysisLastFour = (analysisData.lastFourDigits || '').trim();
        
        // Comparar los 3 campos
        const bankMatch = normalizedCardBank === normalizedAnalysisBank;
        const nameMatch = normalizedCardName === normalizedAnalysisName;
        const lastFourMatch = cardLastFour === analysisLastFour;
        
        const isExactMatch = bankMatch && nameMatch && lastFourMatch;
        
        console.log(`🔍 Comparando con "${card.name}":`);
        console.log(`   Banco: ${bankMatch} (${normalizedCardBank} vs ${normalizedAnalysisBank})`);
        console.log(`   Nombre: ${nameMatch} (${normalizedCardName} vs ${normalizedAnalysisName})`);
        console.log(`   Últimos 4: ${lastFourMatch} (${cardLastFour} vs ${analysisLastFour})`);
        console.log(`   Coincidencia EXACTA: ${isExactMatch}`);
        
        if (isExactMatch) {
            console.log(`🎯 ¡Coincidencia exacta encontrada!`);
            result.exactMatches.push({ card });
            break; // Solo necesitamos una coincidencia
        }
    }

    result.hasExactMatch = result.exactMatches.length > 0;
    
    console.log('📊 Resultado:', {
        hasExactMatch: result.hasExactMatch,
        exactMatches: result.exactMatches.length,
        canCreateSafely: result.canCreateSafely
    });

    return result;
};

/**
 * Genera sugerencias para el usuario
 */
export const generateCardSuggestions = (cardMatchResult, existingCards = []) => {
    const { exactMatches } = cardMatchResult;

    const suggestions = {
        action: 'unknown',
        title: '',
        message: '',
        options: [],
        severity: 'info'
    };

    if (exactMatches.length > 0) {
        // Caso 1: Coincidencia exacta encontrada
        suggestions.action = 'link_existing';
        suggestions.title = '🎯 Tarjeta Encontrada';
        suggestions.message = 'Encontramos una tarjeta que coincide exactamente con este estado de cuenta.';
        suggestions.severity = 'success';
        suggestions.options = [
            {
                id: 'link',
                label: `Vincular con "${exactMatches[0].card.name}"`,
                recommended: true,
                card: exactMatches[0].card
            }
        ];
    } else if (!existingCards || existingCards.length === 0) {
        // Caso 2: Primera tarjeta - crear automáticamente
        suggestions.action = 'safe_create';
        suggestions.title = '✅ Crear Nueva Tarjeta';
        suggestions.message = 'No hay tarjetas existentes. Creando nueva tarjeta...';
        suggestions.severity = 'success';
        suggestions.options = [
            {
                id: 'create_new',
                label: 'Crear nueva tarjeta',
                recommended: true
            }
        ];
    } else {
        // Caso 3: No hay coincidencia pero existen tarjetas - mostrar todas
        suggestions.action = 'select_card';
        suggestions.title = '🔍 Seleccionar Tarjeta';
        suggestions.message = 'No se encontró una coincidencia exacta. Selecciona la tarjeta a la que pertenece este estado de cuenta o crea una nueva:';
        suggestions.severity = 'info';
        
        // Mostrar TODAS las tarjetas existentes
        existingCards.forEach((card, index) => {
            suggestions.options.push({
                id: 'link',
                label: `Vincular con "${card.name}"`,
                recommended: false,
                card: card,
                reasons: [
                    `Banco: ${card.bank}`,
                    `Número: ${card.cardNumber || 'No disponible'}`
                ]
            });
        });
        
        // Opción para crear nueva tarjeta
        suggestions.options.push({
            id: 'create_new',
            label: 'Crear nueva tarjeta',
            recommended: false
        });
    }

    return suggestions;
};

/**
 * Valida si es seguro proceder automáticamente (sin modal)
 */
export const isSafeToAutoCreate = (cardMatchResult, analysisData, existingCards = []) => {
    if (!cardMatchResult || typeof cardMatchResult !== 'object') {
        console.warn('⚠️ isSafeToAutoCreate: cardMatchResult es inválido');
        return false;
    }

    if (!analysisData || typeof analysisData !== 'object') {
        console.warn('⚠️ isSafeToAutoCreate: analysisData es inválido');
        return false;
    }

    const { exactMatches } = cardMatchResult;
    
    // Caso 1: Si hay coincidencia exacta, es seguro proceder automáticamente
    if (exactMatches && exactMatches.length > 0) {
        console.log('🎯 Coincidencia exacta encontrada - proceder automáticamente con tarjeta existente');
        return true;
    }
    
    // Caso 2: Si no hay tarjetas existentes, es seguro crear automáticamente (primera tarjeta)
    if (!existingCards || existingCards.length === 0) {
        console.log('✅ Primera tarjeta - crear automáticamente');
        return true;
    }
    
    // Caso 3: No hay coincidencia pero existen tarjetas - requerir confirmación del usuario
    console.log('🔒 No hay coincidencia exacta y existen tarjetas - requerir confirmación del usuario');
    return false;
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

    // 🔧 SIMPLIFICADO: Solo requerir banco y últimos 4 dígitos
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

    // 🔧 SIMPLIFICADO: Solo requerir banco y últimos 4 dígitos válidos
    const isSufficient = hasMinimumData && hasValidData;
    
    console.log('🔍 [DEBUG] Evaluando datos suficientes para crear tarjeta:', {
        hasMinimumData,
        hasValidData,
        dataQuality: {
            bankName: analysisData.bankName,
            lastFourDigits: analysisData.lastFourDigits,
            cardHolderName: analysisData.cardHolderName
        },
        finalDecision: isSufficient
    });

    return isSufficient;
};
