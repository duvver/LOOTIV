const fs = require('fs');

// 1. Update EJS
const ejsFile = 'C:/Users/eness/Desktop/LOOTIV/views/turkpoker.ejs';
let ejsContent = fs.readFileSync(ejsFile, 'utf8');

ejsContent = ejsContent.replace(
  /<button type="button" id="theme-toggle-btn" onclick="window\.toggleTurkPokerTheme\(\)" class="[^"]+" style="[^"]+" title="[^"]+">\s*<span class="material-symbols-outlined" style="[^"]+">aspect_ratio<\/span> Görünüm\s*<\/button>/,
  `<button type="button" id="theme-toggle-btn" onclick="window.toggleTurkPokerTheme()" class="bg-surface-container text-on-surface-variant hover:bg-primary/10 transition-all cursor-pointer" style="position: absolute; top: 15px; right: 15px; z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);" title="Masa Temasýný Deðiþtir">
    <span id="theme-icon" class="material-symbols-outlined" style="font-size: 24px;">crop_square</span>
  </button>`
);
fs.writeFileSync(ejsFile, ejsContent);

// 2. Update JS
const jsFile = 'C:/Users/eness/Desktop/LOOTIV/public/js/turkpoker.js';
let jsContent = fs.readFileSync(jsFile, 'utf8');

jsContent = jsContent.replace(
  /window\.toggleTurkPokerTheme = function\(\) \{[\s\S]*?\};\s*\/\/ Initial load[\s\S]*?\}\);/,
  `window.toggleTurkPokerTheme = function() {
  const pokerTable = document.querySelector('.poker-table');
  const themeIcon = document.getElementById('theme-icon');
  if (pokerTable) {
    pokerTable.classList.toggle('theme-square');
    const isSquare = pokerTable.classList.contains('theme-square');
    localStorage.setItem('turkpoker-theme', isSquare ? 'square' : 'oval');
    if (themeIcon) {
        themeIcon.textContent = isSquare ? 'radio_button_unchecked' : 'crop_square';
    }
  }
};

// Initial load
document.addEventListener('DOMContentLoaded', () => {
  const pokerTable = document.querySelector('.poker-table');
  const themeIcon = document.getElementById('theme-icon');
  if (pokerTable && localStorage.getItem('turkpoker-theme') === 'square') {
    pokerTable.classList.add('theme-square');
    if (themeIcon) themeIcon.textContent = 'radio_button_unchecked';
  }
});`
);
fs.writeFileSync(jsFile, jsContent);

console.log("Updated theme button to be an icon-only toggle");
