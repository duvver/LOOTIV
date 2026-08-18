const fs = require('fs');
const file = 'C:/Users/eness/Desktop/LOOTIV/lib/db.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/await query\(/g, 'await pool.query(');

fs.writeFileSync(file, content);
console.log("Updated db.js to use pool.query");
