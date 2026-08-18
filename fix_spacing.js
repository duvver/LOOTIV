const fs = require('fs');
const file = 'C:/Users/eness/Desktop/LOOTIV/public/css/turkpoker.css';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/\.seat-pos-0 \{ top: 88%;/, '.seat-pos-0 { top: 82%;');

content = content.replace(/\.table-status \{\s*position: absolute;\s*top: 44%;/, '.table-status {\n    position: absolute;\n    top: 38%;');

content = content.replace(/\.table-title \{\s*position: absolute;\s*top: 35%;/, '.table-title {\n    position: absolute;\n    top: 28%;');

content = content.replace(/\.table-pot \{\s*position: absolute;\s*top: 47%;/, '.table-pot {\n    position: absolute;\n    top: 47%;'); // It is already 47%, which is fine.

fs.writeFileSync(file, content);
console.log("Updated UI spacing again");
