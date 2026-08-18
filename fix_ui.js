const fs = require('fs');
const file = 'C:/Users/eness/Desktop/LOOTIV/public/css/turkpoker.css';
let content = fs.readFileSync(file, 'utf8');

// 1. Enlarge table felt
content = content.replace(/max-width: 750px;\s*height: 380px;/, 'max-width: 820px;\n    height: 420px;');

// 2. Adjust table title
content = content.replace(/font-size: 1\.2rem;\s*opacity: 0\.15;/, 'font-size: 0.95rem;\n      opacity: 0.1;');

// 3. Move Pot up a tiny bit to make room for big cards
content = content.replace(/\.table-pot \{\s*position: absolute;\s*top: 50%;/, '.table-pot {\n    position: absolute;\n    top: 47%;');

// 4. Move Table Status up a tiny bit as well
content = content.replace(/\.table-status \{\s*position: absolute;\s*top: 40%;/, '.table-status {\n    position: absolute;\n    top: 38%;');

// 5. Adjust seat positions to be slightly closer to the edge now that table is bigger
content = content.replace(/\.seat-pos-0 \{ top: 85%; left: 50%; \}/, '.seat-pos-0 { top: 88%; left: 50%; }');
content = content.replace(/\.seat-pos-2 \{ top: 15%; left: 50%; \}/, '.seat-pos-2 { top: 12%; left: 50%; }');

fs.writeFileSync(file, content);
console.log("Updated turkpoker.css UI adjustments");
