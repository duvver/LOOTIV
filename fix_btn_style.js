const fs = require('fs');
const file = 'C:/Users/eness/Desktop/LOOTIV/views/turkpoker.ejs';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /<button type="button" id="theme-toggle-btn" onclick="window\.toggleTurkPokerTheme\(\)" class="p-2 bg-surface-container text-on-surface-variant rounded-lg hover:bg-primary\/10 transition-all cursor-pointer" style="position: absolute; top: 15px; right: 15px; z-index: 9999;" title="Masa Temasn DeYisYtir">\s*<span class="material-symbols-outlined">table_restaurant<\/span>\s*<\/button>/,
  `<button type="button" id="theme-toggle-btn" onclick="window.toggleTurkPokerTheme()" class="bg-surface-container text-on-surface-variant hover:bg-primary/10 transition-all cursor-pointer" style="position: absolute; top: 15px; right: 15px; z-index: 9999; display: flex; align-items: center; padding: 6px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); font-size: 0.85rem;" title="Masa Temasn DeYisYtir">
    <span class="material-symbols-outlined" style="font-size: 18px; margin-right: 6px;">aspect_ratio</span> Görünüm
  </button>`
);

fs.writeFileSync(file, content);
console.log("Updated turkpoker.ejs with new button style");
