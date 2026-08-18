const fs = require('fs');
const file = 'C:/Users/eness/Desktop/LOOTIV/public/css/turkpoker.css';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/\.action-bar \{\s*position: absolute;\s*bottom: 10px;\s*left: 50%;\s*transform: translateX\(-50%\);\s*display: flex;\s*gap: 10px;\s*padding: 10px 20px;/, 
  `.action-bar {\n    position: absolute;\n    bottom: 5px;\n    left: 50%;\n    transform: translateX(-50%);\n    display: flex;\n    gap: 6px;\n    padding: 6px 12px;`);

content = content.replace(/\.action-btn \{\s*padding: 10px 20px;\s*border: none;\s*border-radius: 8px;\s*font-family: 'Outfit', sans-serif;\s*font-weight: bold;\s*font-size: 1rem;/, 
  `.action-btn {\n    padding: 6px 12px;\n    border: none;\n    border-radius: 6px;\n    font-family: 'Outfit', sans-serif;\n    font-weight: bold;\n    font-size: 0.85rem;`);

fs.writeFileSync(file, content);
console.log("Updated action-bar and action-btn sizes");
