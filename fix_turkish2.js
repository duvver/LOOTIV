const fs = require('fs');
const file = 'C:/Users/eness/Desktop/LOOTIV/public/js/turkpoker.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/>Bop<\/button>/g, '>Kabul</button>');
content = content.replace(/>Art\u0131r<\/button>/g, '>Artt\u0131r</button>');

fs.writeFileSync(file, content);
console.log("Updated turkpoker.js with Kabul and Arttýr");
