const fs = require('fs');
const file = 'C:/Users/eness/Desktop/LOOTIV/public/js/turkpoker.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /socket\.on\('turkpoker:players', \(players\) => \{\s*playerCount\.textContent = String\(players\.length\);\s*playerList\.innerHTML = players\s*\.map\(\(name\) => `<li class="player-item"><span class="player-dot"><\/span>\$\{escapeHtml\(name\)\}<\/li>`\)\s*\.join\(''\);\s*\}\);/g,
  `socket.on('turkpoker:players', (players) => {
    if (playerCount) playerCount.textContent = String(players.length);
    if (playerList) {
      playerList.innerHTML = players
        .map((name) => \`<li class="player-item"><span class="player-dot"></span>\${escapeHtml(name)}</li>\`)
        .join('');
    }
  });`
);

fs.writeFileSync(file, content);
console.log("Fixed playerCount null reference");
