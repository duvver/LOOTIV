const fs = require('fs');
const file = 'C:/Users/eness/Desktop/LOOTIV/views/salon.ejs';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /let scale = Math\.min\(scaleW, scaleH\);/,
  `let scale = Math.min(scaleW, scaleH) * 0.9; // Scale down by 10% to prevent scrollbars (Requested by user)`
);

fs.writeFileSync(file, content);
console.log("Updated resizeGameContainer scale in salon.ejs");
