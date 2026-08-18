const fs = require('fs');
const file = 'C:/Users/eness/Desktop/LOOTIV/views/turkpoker.ejs';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /<button type="button" id="theme-toggle-btn"[^>]+>([\s\S]*?)<\/button>/,
  `<button type="button" id="theme-toggle-btn" onclick="window.toggleTurkPokerTheme()" style="position: absolute; top: 15px; left: 15px; z-index: 9999; background: #e53935; color: white; font-weight: bold; border: 2px solid white; padding: 10px 15px; border-radius: 8px; cursor: pointer; font-size: 14px;">
    KARE/OVAL MASA YAP
  </button>`
);

fs.writeFileSync(file, content);
console.log("Updated turkpoker.ejs with onclick and red button");
