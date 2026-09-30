const fs = require('fs');
let content = fs.readFileSync('src/pages/Login.tsx', 'utf8');
content = content.replace(/placeholder="Ã[^"]+"/g, 'placeholder="••••••••"');
content = content.replace(/<span>Ã[^<]+<\/span>/g, '<span>•</span>');
fs.writeFileSync('src/pages/Login.tsx', content);
