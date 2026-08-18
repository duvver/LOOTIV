const fs = require('fs');
const file = 'C:/Users/eness/Desktop/LOOTIV/views/salon.ejs';
let content = fs.readFileSync(file, 'utf8');

// 1. Revert showGame logic
let showGameMatch = content.indexOf(`document.body.classList.add('overflow-hidden', 'h-screen'); // Oyun iin scroll kapat`);
if (showGameMatch !== -1) {
    let endMatch = content.indexOf(`const anaSayfaLink`);
    if (endMatch !== -1) {
        let blockToReplace = content.substring(showGameMatch, endMatch);
        let originalBlock = `// Scroll'a izin ver ve chat panelinin ustune cikmamasi icin alttan bosluk birak
           document.body.classList.remove('overflow-hidden', 'h-screen');
           
           const main = document.querySelector('main');
           if (main) {
               main.classList.add('flex', 'flex-col');
               main.classList.remove('overflow-hidden', 'h-full', 'pb-4');
               // Alt chat paneli icin paddingi koruyalim ki oyunun alti kesilmesin
               main.classList.add('py-8', 'pb-[220px]');
           }
           
           `;
        content = content.replace(blockToReplace, originalBlock);
    }
}

// 2. Revert resizeGameContainer logic
let resizeMatch = content.indexOf(`const availableWidth = window.innerWidth - 20;`);
if (resizeMatch !== -1) {
    let resizeEnd = content.indexOf(`let originalWidth = 1100;`);
    if (resizeEnd !== -1) {
        let blockToReplace = content.substring(resizeMatch, resizeEnd);
        let originalBlock = `const availableWidth = gc.clientWidth;
        let availableHeight = gc.clientHeight;
        
        if (availableHeight < 500) {
            availableHeight = Math.max(500, window.innerHeight - 320); 
        }
        
        `;
        content = content.replace(blockToReplace, originalBlock);
    }
}

// 3. Revert scale calculation
content = content.replace(
  /let scale = Math\.min\(scaleW, scaleH\) \* 0\.9; \/\/ Scale down by 10% to prevent scrollbars \(Requested by user\)/,
  `let scale = Math.min(scaleW, scaleH);`
);

fs.writeFileSync(file, content);
console.log("Reverted salon.ejs");
