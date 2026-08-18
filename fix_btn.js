const fs = require('fs');
const file = 'C:/Users/eness/Desktop/LOOTIV/views/turkpoker.ejs';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /<button type="button" id="theme-toggle-btn" class="[^"]+" style="position: absolute; top: 15px; right: 15px; z-index: 100;" title="Masa Temasn DeYiYtir">\s*<span class="material-symbols-outlined">table_restaurant<\/span>\s*<\/button>/,
  `<button type="button" id="theme-toggle-btn" style="position: absolute; top: 15px; left: 15px; z-index: 100; background: rgba(0,0,0,0.5); color: white; font-weight: bold; border: 1px solid rgba(255,255,255,0.2); padding: 8px 12px; border-radius: 8px; cursor: pointer;">
          Temay DeYiYtir (Kare/Oval)
        </button>`
);

fs.writeFileSync(file, content);
console.log("Updated turkpoker.ejs with text button");
