const fs = require('fs');
const file = 'C:/Users/eness/Desktop/LOOTIV/public/js/turkpoker.js';
let content = fs.readFileSync(file, 'utf8');

// Remove the old listener if it's there
content = content.replace(/\/\/ Theme toggle logic[\s\S]*?const chatInput = document\.getElementById\('chat-input'\);/, `const chatInput = document.getElementById('chat-input');`);

// Append the global function to the very top
const globalFunc = `
window.toggleTurkPokerTheme = function() {
  const pokerTable = document.querySelector('.poker-table');
  if (pokerTable) {
    pokerTable.classList.toggle('theme-square');
    const isSquare = pokerTable.classList.contains('theme-square');
    localStorage.setItem('turkpoker-theme', isSquare ? 'square' : 'oval');
    alert(isSquare ? "Masa KARE oldu!" : "Masa OVAL oldu!");
  } else {
    alert("Hata: poker-table bulunamadi");
  }
};

// Initial load
document.addEventListener('DOMContentLoaded', () => {
  const pokerTable = document.querySelector('.poker-table');
  if (pokerTable && localStorage.getItem('turkpoker-theme') === 'square') {
    pokerTable.classList.add('theme-square');
  }
});
`;

content = globalFunc + '\n' + content;

fs.writeFileSync(file, content);
console.log("Updated turkpoker.js with global toggle function");
