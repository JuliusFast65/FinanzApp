const fs = require('fs');
const path = require('path');

// Función para incrementar la versión
function incrementVersion(version) {
  const parts = version.split('.');
  parts[2] = (parseInt(parts[2]) + 1).toString();
  return parts.join('.');
}

// Función para actualizar la versión en el Service Worker
function updateServiceWorkerVersion() {
  const swPath = path.join(__dirname, '../public/sw.js');
  
  try {
    let content = fs.readFileSync(swPath, 'utf8');
    
    // Buscar la línea con SW_VERSION y actualizarla
    const versionRegex = /const SW_VERSION = '([^']+)';/;
    const match = content.match(versionRegex);
    
    if (match) {
      const currentVersion = match[1];
      const newVersion = incrementVersion(currentVersion);
      
      // Actualizar la versión en el archivo
      const updatedContent = content.replace(versionRegex, `const SW_VERSION = '${newVersion}';`);
      fs.writeFileSync(swPath, updatedContent);
      
      // console.log(`✅ Service Worker version updated: ${currentVersion} → ${newVersion}`);
    } else {
      // console.log('⚠️  Could not find SW_VERSION in service worker');
    }
  } catch (error) {
    console.error('❌ Error updating Service Worker version:', error);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  updateServiceWorkerVersion();
}

module.exports = { updateServiceWorkerVersion }; 