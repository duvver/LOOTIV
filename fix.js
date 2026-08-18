const fs = require('fs');
const file = 'C:/Users/eness/Desktop/LOOTIV/views/salon.ejs';
let content = fs.readFileSync(file, 'utf8');

const regex = /function resizeGameContainer\(\) \{[\s\S]*?window\.addEventListener\('resize', resizeGameContainer\);/;

const replacement = `function resizeGameContainer() {
  const gc = document.getElementById('game-container');
  const gameScaler = document.querySelector('.game-scaler');
  
  if (gc && gameScaler && !gc.classList.contains('hidden')) {
      const availableWidth = gc.clientWidth;
      let availableHeight = gc.clientHeight;
      
      if (availableHeight < 500) {
          availableHeight = Math.max(500, window.innerHeight - 320); 
      }
      
      let originalWidth = 1100;
      let originalHeight = 750;
      
      const isTurkPoker = document.querySelector('.turkpoker');
      const isOkey101 = document.querySelector('.okey101');
      const isOkey = document.querySelector('.okey');
      let targetElement = null;
      
      if (isTurkPoker) {
          originalWidth = 900;
          originalHeight = 450;
          targetElement = isTurkPoker;
      } else if (isOkey101) {
          targetElement = isOkey101;
      } else if (isOkey) {
          targetElement = isOkey;
      } else {
          return;
      }
      
      let scaleW = availableWidth / originalWidth;
      let scaleH = availableHeight / originalHeight;
      let scale = Math.min(scaleW, scaleH);
      
      if (scale > 1.35) scale = 1.35;
      
      gameScaler.style.transform = 'scale(' + scale + ')';
      gameScaler.style.transformOrigin = 'center center';
      gameScaler.style.width = originalWidth + 'px';
      gameScaler.style.height = originalHeight + 'px';
      
      targetElement.style.width = '100%';
      targetElement.style.height = '100%';
      targetElement.style.setProperty('--scale', scale);
      
      const game = targetElement.querySelector('.game');
      if (game) {
          game.style.width = '100%';
          game.style.height = '100%';
      }
  }
}

window.addEventListener('resize', resizeGameContainer);`;

if (content.match(regex)) {
    content = content.replace(regex, replacement);
    fs.writeFileSync(file, content);
    console.log("Success");
} else {
    console.log("Not found");
}
