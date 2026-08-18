const fs = require('fs');
const file = 'C:/Users/eness/Desktop/LOOTIV/views/turkpoker.ejs';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /<button type="button" id="theme-toggle-btn" onclick="window\.toggleTurkPokerTheme\(\)" style="[^"]+">\s*KARE\/OVAL MASA YAP\s*<\/button>/,
  `<button type="button" id="theme-toggle-btn" onclick="window.toggleTurkPokerTheme()" class="p-2 bg-surface-container text-on-surface-variant rounded-lg hover:bg-primary/10 transition-all cursor-pointer" style="position: absolute; top: 15px; right: 15px; z-index: 9999;" title="Masa Temasn DeYisYtir">
    <span class="material-symbols-outlined">table_restaurant</span>
  </button>`
);

fs.writeFileSync(file, content);
console.log("Updated turkpoker.ejs with small icon button");
