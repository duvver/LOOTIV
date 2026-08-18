const fs = require('fs');
const file = 'C:/Users/eness/Desktop/LOOTIV/public/css/turkpoker.css';
let content = fs.readFileSync(file, 'utf8');

// 1. Move table-status to top-left
content = content.replace(
  /\.table-status\s*\{\s*position:\s*absolute;\s*top:\s*38%;/g,
  `.table-status {
    position: absolute;
    top: 20px;
    left: 20px;`
);

// 2. Move table-pot a bit higher (from 47% to 40% or 38%) and ensure it's centered
content = content.replace(
  /\.table-pot\s*\{\s*position:\s*absolute;\s*top:\s*47%;/g,
  `.table-pot {
    position: absolute;
    top: 38%;
    left: 50%;
    transform: translateX(-50%);`
);

fs.writeFileSync(file, content);
console.log("Updated turkpoker.css layout for status and pot");
