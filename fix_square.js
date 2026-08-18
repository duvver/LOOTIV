const fs = require('fs');
const file = 'C:/Users/eness/Desktop/LOOTIV/public/css/turkpoker.css';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/\.theme-square \.table-felt \{[^}]+\}/g, '');

content += `
.theme-square .table-felt {
    width: 100% !important;
    max-width: 100% !important;
    height: 100% !important;
    border-radius: 12px !important;
    border: none !important;
    box-shadow: inset 0 0 80px rgba(0, 0, 0, 0.9) !important;
}
`;

fs.writeFileSync(file, content);
console.log("Updated theme-square in CSS");
