const fs = require('fs');
const file = 'C:/Users/eness/Desktop/LOOTIV/views/salon.ejs';
let content = fs.readFileSync(file, 'utf8');

// Replace showGame scrolling logic
let startIndex = content.indexOf(`document.body.classList.remove('overflow-hidden', 'h-screen');`);
if (startIndex !== -1) {
    let endIndex = content.indexOf(`const anaSayfaLink = document.getElementById('ana-sayfa-link');`);
    if (endIndex !== -1) {
        let blockToReplace = content.substring(startIndex, endIndex);
        
        let newBlock = `document.body.classList.add('overflow-hidden', 'h-screen'); // Oyun iin scroll kapat
           
           const main = document.querySelector('main');
           if (main) {
               main.classList.add('flex', 'flex-col', 'overflow-hidden', 'h-full', 'py-4');
               main.classList.remove('pb-[220px]', 'py-8');
           }
           
           `;
           
        content = content.replace(blockToReplace, newBlock);
    }
}

// Replace resizeGameContainer availableHeight logic
let resizeStart = content.indexOf(`const availableWidth = gc.clientWidth;`);
if (resizeStart !== -1) {
    let resizeEnd = content.indexOf(`let originalWidth = 1100;`);
    if (resizeEnd !== -1) {
        let blockToReplace = content.substring(resizeStart, resizeEnd);
        let newBlock = `const availableWidth = window.innerWidth - 20;
        let availableHeight = window.innerHeight - 150;
        if (availableHeight < 400) availableHeight = 400;
        
        `;
        content = content.replace(blockToReplace, newBlock);
    }
}

fs.writeFileSync(file, content);
console.log("Updated salon.ejs manually");
