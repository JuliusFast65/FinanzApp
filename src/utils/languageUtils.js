// Utilidades para detección de idioma
// Permite que las IAs respondan en el mismo idioma que se les escribe

/**
 * Detecta el idioma del texto basándose en palabras comunes y patrones
 * @param {string} text - El texto a analizar
 * @returns {string} - Código del idioma detectado ('es', 'en', 'fr', etc.)
 */
export const detectLanguage = (text) => {
    if (!text || typeof text !== 'string') {
        return 'es'; // Default a español
    }

    const cleanText = text.toLowerCase().trim();
    
    // Palabras comunes en español
    const spanishWords = [
        'el', 'la', 'de', 'que', 'y', 'a', 'en', 'un', 'es', 'se', 'no', 'te', 'lo', 'le', 'da', 'su', 'por', 'son', 'con', 'para',
        'al', 'del', 'los', 'las', 'una', 'como', 'más', 'pero', 'sus', 'me', 'hasta', 'hay', 'donde', 'han', 'quien', 'están',
        'estado', 'desde', 'todo', 'nos', 'durante', 'todos', 'uno', 'les', 'ni', 'contra', 'otros', 'ese', 'eso', 'ante',
        'ellos', 'e', 'esto', 'mí', 'antes', 'algunos', 'qué', 'unos', 'yo', 'otro', 'otras', 'otra', 'él', 'tanto', 'esa',
        'estos', 'mucho', 'quienes', 'nada', 'muchos', 'cual', 'poco', 'ella', 'estar', 'estas', 'algunas', 'algo', 'nosotros'
    ];

    // Palabras comunes en inglés
    const englishWords = [
        'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you',
        'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one',
        'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
        'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take', 'people', 'into', 'year', 'your', 'good',
        'some', 'could', 'them', 'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think'
    ];

    // Palabras comunes en francés
    const frenchWords = [
        'le', 'de', 'un', 'être', 'et', 'en', 'avoir', 'ne', 'je', 'son', 'que', 'se', 'qui', 'ce', 'dans', 'en', 'ce', 'il',
        'que', 'pour', 'pas', 'sur', 'ce', 'faire', 'se', 'comme', 'être', 'sur', 'ce', 'aller', 'voir', 'me', 'en', 'de',
        'du', 'le', 'moi', 'qui', 'nous', 'votre', 'ma', 'même', 'te', 'en', 'si', 'leur', 'y', 'une', 'aussi', 'elle', 'de',
        'un', 'déjà', 'deux', 'vouloir', 'mari', 'parler', 'alors', 'jeune', 'prochain', 'droit', 'faut', 'vers', 'après',
        'trouver', 'personne', 'donner', 'part', 'dernier', 'venir', 'pendant', 'passer', 'petit', 'lequel', 'jour', 'moins'
    ];

    // Contar ocurrencias de palabras en cada idioma
    const words = cleanText.split(/\s+/);
    let spanishCount = 0;
    let englishCount = 0;
    let frenchCount = 0;

    words.forEach(word => {
        if (spanishWords.includes(word)) spanishCount++;
        if (englishWords.includes(word)) englishCount++;
        if (frenchWords.includes(word)) frenchCount++;
    });

    // Determinar el idioma con más coincidencias
    const maxCount = Math.max(spanishCount, englishCount, frenchCount);
    
    if (maxCount === 0) {
        // Si no hay coincidencias claras, usar patrones de caracteres
        const spanishPatterns = /[áéíóúñü]/g;
        const frenchPatterns = /[àâäéèêëïîôöùûüÿç]/g;
        
        const spanishChars = (cleanText.match(spanishPatterns) || []).length;
        const frenchChars = (cleanText.match(frenchPatterns) || []).length;
        
        if (spanishChars > frenchChars) return 'es';
        if (frenchChars > spanishChars) return 'fr';
        return 'en'; // Default a inglés si no hay patrones claros
    }

    if (spanishCount === maxCount) return 'es';
    if (englishCount === maxCount) return 'en';
    if (frenchCount === maxCount) return 'fr';
    
    return 'es'; // Default a español
};

/**
 * Obtiene el nombre del idioma en español
 * @param {string} languageCode - Código del idioma
 * @returns {string} - Nombre del idioma en español
 */
export const getLanguageName = (languageCode) => {
    const languages = {
        'es': 'español',
        'en': 'inglés',
        'fr': 'francés',
        'pt': 'portugués',
        'it': 'italiano',
        'de': 'alemán'
    };
    return languages[languageCode] || 'español';
};

/**
 * Obtiene instrucciones de idioma para prompts de IA
 * @param {string} languageCode - Código del idioma
 * @returns {string} - Instrucción de idioma para la IA
 */
export const getLanguageInstruction = (languageCode) => {
    const instructions = {
        'es': 'Responde siempre en español, manteniendo un tono natural y conversacional.',
        'en': 'Respond always in English, maintaining a natural and conversational tone.',
        'fr': 'Répondez toujours en français, en maintenant un ton naturel et conversationnel.',
        'pt': 'Responda sempre em português, mantendo um tom natural e conversacional.',
        'it': 'Rispondi sempre in italiano, mantenendo un tono naturale e conversazionale.',
        'de': 'Antworten Sie immer auf Deutsch und behalten Sie einen natürlichen und gesprächigen Ton bei.'
    };
    return instructions[languageCode] || instructions['es'];
}; 