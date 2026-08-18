const fs = require('fs');
const file = 'C:/Users/eness/Desktop/LOOTIV/public/css/turkpoker.css';
let content = fs.readFileSync(file, 'utf8');

// Update card sizes
content = content.replace(/\.card-container \{\s*perspective: 1000px;\s*width: 40px;\s*height: 56px;\s*margin-right: -20px;\s*\}/, 
  `.card-container {\n    perspective: 1000px;\n    width: 46px;\n    height: 64px;\n    margin-right: -15px;\n}`);
content = content.replace(/\.seat-pos-0 \.card-container \{\s*width: 52px;\s*height: 72px;\s*margin-right: -26px;\s*\}/, 
  `.seat-pos-0 .card-container {\n    width: 60px;\n    height: 84px;\n    margin-right: -18px;\n}`);

// Add !important to card-selected
content = content.replace(/\.card-selected \.card-inner \{\s*transform: translateY\(-15px\) rotateY\(180deg\) scale\(1\.1\);\s*box-shadow: 0 0 20px rgba\(255, 215, 0, 0\.9\), 0 10px 20px rgba\(0,0,0,0\.5\);\s*\}/, 
  `.card-selected .card-inner {\n    transform: translateY(-20px) rotateY(180deg) scale(1.1) !important;\n    box-shadow: 0 0 20px rgba(255, 215, 0, 0.9), 0 10px 20px rgba(0,0,0,0.5) !important;\n}`);

// Add square theme
content += `\n/* Square Theme */
.theme-square .table-felt {
    width: 100%;
    max-width: 100%;
    height: 100%;
    border-radius: 12px;
    border: none;
    box-shadow: inset 0 0 80px rgba(0, 0, 0, 0.9);
}
`;

fs.writeFileSync(file, content);
console.log("Updated turkpoker.css");
