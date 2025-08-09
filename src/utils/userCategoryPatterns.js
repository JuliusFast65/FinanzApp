// Sistema de patrones personalizados del usuario
import { collection, addDoc, getDocs, query, where, updateDoc, doc, deleteDoc } from 'firebase/firestore';

// Crear o actualizar patrón personalizado del usuario
export const saveUserCategoryPattern = async (db, userId, appId, description, category, confidence = 'user') => {
    try {
        // Normalizar descripción para búsqueda
        const normalizedDescription = description.toUpperCase().trim();
        
        // Verificar si ya existe un patrón para esta descripción
        const patternsRef = collection(db, 'artifacts', appId, 'users', userId, 'categoryPatterns');
        const existingQuery = query(patternsRef, where('normalizedDescription', '==', normalizedDescription));
        const existingSnapshot = await getDocs(existingQuery);
        
        if (!existingSnapshot.empty) {
            // Actualizar patrón existente
            const existingDoc = existingSnapshot.docs[0];
            await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'categoryPatterns', existingDoc.id), {
                category,
                confidence,
                lastUpdated: new Date(),
                timesUsed: (existingDoc.data().timesUsed || 0) + 1
            });
            
            console.log('Patrón personalizado actualizado:', normalizedDescription, '→', category);
            return existingDoc.id;
        } else {
            // Crear nuevo patrón
            const newPattern = {
                originalDescription: description,
                normalizedDescription,
                category,
                confidence,
                createdAt: new Date(),
                lastUpdated: new Date(),
                timesUsed: 1,
                userId
            };
            
            const docRef = await addDoc(patternsRef, newPattern);
            console.log('Nuevo patrón personalizado creado:', normalizedDescription, '→', category);
            return docRef.id;
        }
    } catch (error) {
        console.error('Error guardando patrón personalizado:', error);
        throw error;
    }
};

// Cargar todos los patrones personalizados del usuario
export const loadUserCategoryPatterns = async (db, userId, appId) => {
    try {
        const patternsRef = collection(db, 'artifacts', appId, 'users', userId, 'categoryPatterns');
        const snapshot = await getDocs(patternsRef);
        
        const patterns = {};
        snapshot.forEach(doc => {
            const data = doc.data();
            patterns[data.normalizedDescription] = {
                id: doc.id,
                category: data.category,
                confidence: data.confidence,
                timesUsed: data.timesUsed || 1,
                lastUpdated: data.lastUpdated,
                originalDescription: data.originalDescription
            };
        });
        
        console.log(`Cargados ${Object.keys(patterns).length} patrones personalizados del usuario`);
        return patterns;
    } catch (error) {
        console.error('Error cargando patrones personalizados:', error);
        return {};
    }
};

// Buscar patrón personalizado para una descripción
export const findUserCategoryPattern = (userPatterns, description) => {
    const normalizedDescription = description.toUpperCase().trim();
    
    // Búsqueda exacta
    if (userPatterns[normalizedDescription]) {
        return userPatterns[normalizedDescription];
    }
    
    // Búsqueda por coincidencia parcial (palabras clave)
    for (const [patternDesc, patternData] of Object.entries(userPatterns)) {
        // Si la descripción del patrón está contenida en la descripción actual
        if (normalizedDescription.includes(patternDesc)) {
            return patternData;
        }
        
        // Si la descripción actual está contenida en el patrón (menos probable pero útil)
        if (patternDesc.includes(normalizedDescription) && normalizedDescription.length > 5) {
            return patternData;
        }
    }
    
    return null;
};

// Eliminar patrón personalizado
export const deleteUserCategoryPattern = async (db, userId, appId, patternId) => {
    try {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'categoryPatterns', patternId));
        console.log('Patrón personalizado eliminado:', patternId);
    } catch (error) {
        console.error('Error eliminando patrón personalizado:', error);
        throw error;
    }
};

// Obtener estadísticas de patrones del usuario
export const getUserPatternStats = async (db, userId, appId) => {
    try {
        const patternsRef = collection(db, 'artifacts', appId, 'users', userId, 'categoryPatterns');
        const snapshot = await getDocs(patternsRef);
        
        const stats = {
            totalPatterns: snapshot.size,
            byCategory: {},
            totalUsage: 0,
            mostUsedPatterns: []
        };
        
        const patterns = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            patterns.push({
                id: doc.id,
                ...data
            });
            
            // Estadísticas por categoría
            if (!stats.byCategory[data.category]) {
                stats.byCategory[data.category] = 0;
            }
            stats.byCategory[data.category]++;
            
            // Total de uso
            stats.totalUsage += data.timesUsed || 1;
        });
        
        // Patrones más usados
        stats.mostUsedPatterns = patterns
            .sort((a, b) => (b.timesUsed || 1) - (a.timesUsed || 1))
            .slice(0, 10);
        
        return stats;
    } catch (error) {
        console.error('Error obteniendo estadísticas de patrones:', error);
        return {
            totalPatterns: 0,
            byCategory: {},
            totalUsage: 0,
            mostUsedPatterns: []
        };
    }
};

export default {
    saveUserCategoryPattern,
    loadUserCategoryPatterns,
    findUserCategoryPattern,
    deleteUserCategoryPattern,
    getUserPatternStats
};
