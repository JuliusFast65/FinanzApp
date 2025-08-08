// --- Funciones de Encriptación ---
export const getCryptoKey = async (uid) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(uid);
    const hash = await window.crypto.subtle.digest('SHA-256', data);
    return window.crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
};

export const encryptText = async (text, uid) => {
    if (!text || !uid) return text || '';
    try {
        const key = await getCryptoKey(uid);
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encryptedData = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
        const buffer = new Uint8Array(iv.length + encryptedData.byteLength);
        buffer.set(iv, 0);
        buffer.set(new Uint8Array(encryptedData), iv.length);
        return btoa(String.fromCharCode.apply(null, buffer));
    } catch (error) {
        console.error("Encryption failed:", error);
        return text;
    }
};

export const decryptText = async (encryptedBase64, uid) => {
    if (!encryptedBase64) return '';
    
    // Verificar si el texto parece estar encriptado (base64 válido)
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(encryptedBase64)) {
        // Si no es base64 válido, probablemente es texto plano
        return encryptedBase64;
    }
    
    try {
        const key = await getCryptoKey(uid);
        const buffer = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
        const iv = buffer.slice(0, 12);
        const data = buffer.slice(12);
        const decryptedData = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
        const decoder = new TextDecoder();
        return decoder.decode(decryptedData);
    } catch (error) {
        console.error("Decryption failed:", error);
        // Si falla la desencriptación, devolver el texto original
        return encryptedBase64;
    }
}; 