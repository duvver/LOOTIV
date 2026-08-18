const fs = require('fs');
const file = 'C:/Users/eness/Desktop/LOOTIV/views/turkpoker.ejs';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /<div class="table-felt" id="table-felt">/,
  `<button type="button" id="theme-toggle-btn" class="p-2 bg-surface-container text-on-surface-variant rounded-lg hover:bg-primary/10 transition-all cursor-pointer" style="position: absolute; top: 15px; right: 15px; z-index: 100;" title="Masa Temasn DeYiYtir">
          <span class="material-symbols-outlined">table_restaurant</span>
        </button>
        <div class="table-felt" id="table-felt">`
);

fs.writeFileSync(file, content);
console.log("Updated turkpoker.ejs");
