const fs = require('fs');
const file = 'C:/Users/eness/Desktop/LOOTIV/views/turkpoker.ejs';
let content = fs.readFileSync(file, 'utf8');

// Remove from inside table-felt
content = content.replace(/\s*<div class="table-status" id="table-status"><\/div>/, '');

// Place it before the theme-toggle-btn (so it's a direct child of poker-table)
content = content.replace(
  /<button type="button" id="theme-toggle-btn"/,
  `<div class="table-status" id="table-status" style="position: absolute; top: 15px; left: 15px; z-index: 100;"></div>\n      <button type="button" id="theme-toggle-btn"`
);

fs.writeFileSync(file, content);
console.log("Moved table-status outside of table-felt");
