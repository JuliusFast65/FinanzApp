const fs = require('fs');
const path = require('path');

// Función para crear un icono PNG simple basado en el SVG
// En un entorno real, usarías una librería como sharp o canvas
function createPNGIcon(size, filename) {
  // Crear un SVG simple para el icono PNG
  const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <linearGradient id="bookGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#3B82F6;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#1E40AF;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="pageGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#F9FAFB;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#F3F4F6;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- Fondo circular -->
  <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 10}" fill="url(#bookGradient)" stroke="#1E40AF" stroke-width="2"/>
  
  <!-- Libro/Diario -->
  <g transform="translate(${size/2}, ${size/2})">
    <!-- Lomo del libro -->
    <rect x="-${size/8}" y="-${size/6}" width="${size/25}" height="${size/3}" rx="2" fill="#1E40AF" stroke="#0F172A" stroke-width="1"/>
    
    <!-- Páginas del libro -->
    <rect x="-${size/8.5}" y="-${size/6}" width="${size/4}" height="${size/3}" rx="4" fill="url(#pageGradient)" stroke="#E5E7EB" stroke-width="1"/>
    
    <!-- Líneas de texto simuladas -->
    <g stroke="#6B7280" stroke-width="1" stroke-linecap="round">
      <line x1="-${size/10}" y1="-${size/8}" x2="${size/10}" y2="-${size/8}"/>
      <line x1="-${size/10}" y1="-${size/10}" x2="${size/12}" y2="-${size/10}"/>
      <line x1="-${size/10}" y1="-${size/12}" x2="${size/11}" y2="-${size/12}"/>
      <line x1="-${size/10}" y1="-${size/15}" x2="${size/13}" y2="-${size/15}"/>
      <line x1="-${size/10}" y1="-${size/20}" x2="${size/12}" y2="-${size/20}"/>
      <line x1="-${size/10}" y1="-${size/25}" x2="${size/11}" y2="-${size/25}"/>
      <line x1="-${size/10}" y1="0" x2="${size/10}" y2="0"/>
      <line x1="-${size/10}" y1="${size/25}" x2="${size/12}" y2="${size/25}"/>
      <line x1="-${size/10}" y1="${size/20}" x2="${size/11}" y2="${size/20}"/>
      <line x1="-${size/10}" y1="${size/15}" x2="${size/13}" y2="${size/15}"/>
      <line x1="-${size/10}" y1="${size/12}" x2="${size/10}" y2="${size/12}"/>
      <line x1="-${size/10}" y1="${size/10}" x2="${size/12}" y2="${size/10}"/>
      <line x1="-${size/10}" y1="${size/8}" x2="${size/11}" y2="${size/8}"/>
    </g>
    
    <!-- Lápiz/Pluma -->
    <g transform="translate(${size/10}, -${size/12}) rotate(15)">
      <rect x="-1" y="-${size/20}" width="2" height="${size/10}" rx="1" fill="#F59E0B" stroke="#D97706" stroke-width="0.5"/>
      <polygon points="-1,-${size/20} 1,-${size/20} 0,-${size/15}" fill="#DC2626"/>
      <circle cx="0" cy="${size/25}" r="1.5" fill="#6B7280"/>
    </g>
  </g>
  
  <!-- Símbolo de reflexión/introspección -->
  <g transform="translate(${size/2}, ${size/2})">
    <circle cx="0" cy="-${size/4}" r="${size/30}" fill="none" stroke="#F9FAFB" stroke-width="1.5" opacity="0.8"/>
    <circle cx="0" cy="-${size/4}" r="${size/60}" fill="#F9FAFB" opacity="0.6"/>
  </g>
</svg>`;

  // Guardar como SVG temporal
  const tempSvgPath = path.join(__dirname, '..', 'public', `temp-${filename}.svg`);
  fs.writeFileSync(tempSvgPath, svgContent);
  
  console.log(`✅ Creado: ${filename} (${size}x${size})`);
  
  // Nota: En un entorno real, aquí convertirías el SVG a PNG
  // Por ahora, solo creamos el SVG como placeholder
  return tempSvgPath;
}

// Iconos a generar
const icons = [
  { size: 196, filename: 'favicon-196.png' },
  { size: 180, filename: 'apple-icon-180.png' },
  { size: 192, filename: 'manifest-icon-192.maskable.png' },
  { size: 512, filename: 'manifest-icon-512.maskable.png' }
];

console.log('🎨 Generando iconos faltantes...\n');

icons.forEach(icon => {
  createPNGIcon(icon.size, icon.filename);
});

console.log('\n📝 Nota: Los archivos SVG temporales se han creado.');
console.log('🔄 Para convertir a PNG, necesitarías una librería como sharp o canvas.');
console.log('💡 Alternativa: Usar herramientas online como convertio.co o favicon.io');
