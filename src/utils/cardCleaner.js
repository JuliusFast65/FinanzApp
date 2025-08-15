// Utilidad para limpiar tarjetas duplicadas existentes
// Identifica y sugiere acciones para tarjetas que pueden ser duplicadas

import { normalizeCardData } from './cardMatcher.js';

/**
 * Encuentra tarjetas duplicadas en la lista existente
 * @param {Array} existingCards - Lista de tarjetas existentes
 * @returns {Object} Resultado del análisis de duplicados existentes
 */
export const findExistingDuplicates = (existingCards) => {
    if (!existingCards || !Array.isArray(existingCards) || existingCards.length < 2) {
        return {
            hasDuplicates: false,
            duplicateGroups: [],
            suggestions: []
        };
    }

    const duplicateGroups = [];
    const processedCards = new Set();

    for (let i = 0; i < existingCards.length; i++) {
        if (processedCards.has(i)) continue;

        const currentCard = existingCards[i];
        const normalizedCurrent = normalizeCardData(currentCard);
        const group = [currentCard];
        processedCards.add(i);

        // Buscar tarjetas similares
        for (let j = i + 1; j < existingCards.length; j++) {
            if (processedCards.has(j)) continue;

            const compareCard = existingCards[j];
            const normalizedCompare = normalizeCardData(compareCard);

            // Verificar si son duplicados potenciales
            if (isPotentialDuplicate(normalizedCurrent, normalizedCompare)) {
                group.push(compareCard);
                processedCards.add(j);
            }
        }

        // Si hay más de una tarjeta en el grupo, es un duplicado
        if (group.length > 1) {
            duplicateGroups.push({
                cards: group,
                similarityScore: calculateGroupSimilarity(group),
                primaryCard: findPrimaryCard(group),
                duplicateCards: group.slice(1)
            });
        }
    }

    const suggestions = generateCleanupSuggestions(duplicateGroups);

    return {
        hasDuplicates: duplicateGroups.length > 0,
        duplicateGroups,
        suggestions
    };
};

/**
 * Determina si dos tarjetas son potencialmente duplicadas
 */
const isPotentialDuplicate = (card1, card2) => {
    // Mismo banco y titular = duplicado fuerte
    if (card1.bank === card2.bank && 
        card1.holderName === card2.holderName && 
        card1.bank && card2.bank && 
        card1.holderName && card2.holderName) {
        return true;
    }

    // Mismo banco y últimos 4 dígitos = duplicado fuerte
    if (card1.bank === card2.bank && 
        card1.lastFour === card2.lastFour && 
        card1.bank && card2.bank && 
        card1.lastFour && card2.lastFour) {
        return true;
    }

    // Mismo titular y últimos 4 dígitos = duplicado fuerte
    if (card1.holderName === card2.holderName && 
        card1.lastFour === card2.lastFour && 
        card1.holderName && card2.holderName && 
        card1.lastFour && card2.lastFour) {
        return true;
    }

    return false;
};

/**
 * Calcula la similitud general de un grupo de tarjetas
 */
const calculateGroupSimilarity = (cards) => {
    if (cards.length < 2) return 100;

    let totalSimilarity = 0;
    let comparisons = 0;

    for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
            const card1 = normalizeCardData(cards[i]);
            const card2 = normalizeCardData(cards[j]);
            
            // Calcular similitud basada en banco, titular y últimos 4 dígitos
            let similarity = 0;
            
            if (card1.bank === card2.bank) similarity += 33.33;
            if (card1.holderName === card2.holderName) similarity += 33.33;
            if (card1.lastFour === card2.lastFour) similarity += 33.33;
            
            totalSimilarity += similarity;
            comparisons++;
        }
    }

    return comparisons > 0 ? totalSimilarity / comparisons : 0;
};

/**
 * Encuentra la tarjeta principal de un grupo (la que tiene más información)
 */
const findPrimaryCard = (cards) => {
    if (cards.length === 0) return null;

    let primaryCard = cards[0];
    let maxScore = calculateCardCompletenessScore(cards[0]);

    for (const card of cards.slice(1)) {
        const score = calculateCardCompletenessScore(card);
        if (score > maxScore) {
            maxScore = score;
            primaryCard = card;
        }
    }

    return primaryCard;
};

/**
 * Calcula un score de completitud de una tarjeta
 */
const calculateCardCompletenessScore = (card) => {
    let score = 0;
    
    if (card.name && card.name.trim()) score += 20;
    if (card.bank && card.bank.trim()) score += 20;
    if (card.cardNumber && card.cardNumber.trim()) score += 20;
    if (card.limit && card.limit > 0) score += 15;
    if (card.currentBalance !== undefined) score += 15;
    if (card.dueDate) score += 10;

    return score;
};

/**
 * Genera sugerencias de limpieza para grupos de duplicados
 */
const generateCleanupSuggestions = (duplicateGroups) => {
    const suggestions = [];

    for (const group of duplicateGroups) {
        const { cards, primaryCard, duplicateCards } = group;
        
        suggestions.push({
            type: 'merge_duplicates',
            title: `🔄 Tarjetas Duplicadas Detectadas (${cards.length} tarjetas)`,
            message: `Se encontraron ${cards.length} tarjetas que parecen ser la misma:`,
            primaryCard: {
                id: primaryCard.id,
                name: primaryCard.name,
                bank: primaryCard.bank,
                cardNumber: primaryCard.cardNumber
            },
            duplicateCards: duplicateCards.map(card => ({
                id: card.id,
                name: card.name,
                bank: card.bank,
                cardNumber: card.cardNumber
            })),
            actions: [
                {
                    id: 'keep_primary',
                    label: `Mantener "${primaryCard.name}"`,
                    description: 'Eliminar las otras tarjetas duplicadas',
                    recommended: true
                },
                {
                    id: 'manual_review',
                    label: 'Revisar manualmente',
                    description: 'Decidir qué hacer con cada tarjeta',
                    recommended: false
                }
            ]
        });
    }

    return suggestions;
};

/**
 * Valida si una tarjeta puede ser eliminada de forma segura
 */
export const canSafelyDeleteCard = (card, statementsCount = 0) => {
    // No eliminar si tiene estados de cuenta asociados
    if (statementsCount > 0) {
        return {
            canDelete: false,
            reason: `La tarjeta tiene ${statementsCount} estado(s) de cuenta asociado(s). Elimina primero los estados de cuenta.`,
            action: 'delete_statements_first'
        };
    }

    // Verificar si la tarjeta tiene datos importantes
    const hasImportantData = card.limit > 0 || card.currentBalance !== 0;
    
    if (hasImportantData) {
        return {
            canDelete: false,
            reason: 'La tarjeta tiene límite de crédito o saldo. Verifica que realmente quieras eliminarla.',
            action: 'confirm_deletion'
        };
    }

    return {
        canDelete: true,
        reason: 'La tarjeta puede ser eliminada de forma segura.',
        action: 'safe_to_delete'
    };
};
