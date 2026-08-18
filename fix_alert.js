const fs = require('fs');
const file = 'C:/Users/eness/Desktop/LOOTIV/public/js/turkpoker.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/alert\(isSquare \? "Masa KARE oldu!" : "Masa OVAL oldu!"\);/, '');

fs.writeFileSync(file, content);
console.log("Removed alert from turkpoker.js");
