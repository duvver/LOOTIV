const fs = require('fs');
const file = 'C:/Users/eness/Desktop/LOOTIV/public/js/turkpoker.js';
let content = fs.readFileSync(file, 'utf8');

const themeLogic = `
  // Theme toggle logic
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const pokerTable = document.querySelector('.poker-table');
  if (themeToggleBtn && pokerTable) {
    // Load saved theme
    const savedTheme = localStorage.getItem('turkpoker-theme');
    if (savedTheme === 'square') {
      pokerTable.classList.add('theme-square');
    }
    
    themeToggleBtn.addEventListener('click', () => {
      pokerTable.classList.toggle('theme-square');
      if (pokerTable.classList.contains('theme-square')) {
        localStorage.setItem('turkpoker-theme', 'square');
      } else {
        localStorage.setItem('turkpoker-theme', 'oval');
      }
    });
  }
`;

// Insert it at the end of the DOMContentLoaded block, right before the socket logic or anywhere inside the main function
content = content.replace(
  /const chatInput = document\.getElementById\('chat-input'\);/,
  themeLogic + '\n  const chatInput = document.getElementById(\'chat-input\');'
);

fs.writeFileSync(file, content);
console.log("Updated turkpoker.js with theme toggle");
