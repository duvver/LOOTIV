const fs = require('fs');
const file = 'C:/Users/eness/Desktop/LOOTIV/public/js/turkpoker.js';
let content = fs.readFileSync(file, 'utf8');

// Replace the stand button listener
content = content.replace(
  /const standBtn = document\.getElementById\('stand-btn'\);\s*if \(standBtn\) standBtn\.addEventListener\('click', \(\) => socket\.emit\('turkpoker:stand'\)\);/g,
  `const standBtn = document.getElementById('stand-btn');
    if (standBtn) {
      standBtn.addEventListener('click', () => {
        window.isWatchMode = true; // Prevents auto-sit from kicking in instantly
        socket.emit('turkpoker:stand');
      });
    }`
);

fs.writeFileSync(file, content);
console.log("Fixed stand button logic in turkpoker.js");
