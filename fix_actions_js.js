const fs = require('fs');
const file = 'C:/Users/eness/Desktop/LOOTIV/public/js/turkpoker.js';
let content = fs.readFileSync(file, 'utf8');

let startIndex = content.indexOf(`actionBarEl.innerHTML = \``);
if (startIndex !== -1) {
    let endIndex = content.indexOf(`\`;`, startIndex);
    if (endIndex !== -1) {
        let originalHtmlBlock = content.substring(startIndex, endIndex + 2);
        
        let newHtmlBlock = `actionBarEl.innerHTML = \`
        <div class="action-group-left">
          <button type="button" class="action-btn action-fold" id="act-fold">Pas</button>
          \${toCall > 0
            ? \`<button type="button" class="action-btn action-call" id="act-call">Gör \${toCall}</button>\`
            : \`<button type="button" class="action-btn action-check" id="act-check">Kabul</button>\`}
        </div>
        <div class="action-group-right">
          \${maxBet > state.currentBet
            ? \`<button type="button" class="action-btn action-raise" id="act-raise-toggle">Arttýr</button>
               <div class="raise-control" id="raise-panel" style="display: none;">
                 <input type="range" id="raise-slider" min="\${minRaiseTo}" max="\${maxBet}" value="\${minRaiseTo}" step="1" />
                 <span id="raise-amount">\${minRaiseTo}</span>
                 <button type="button" class="action-btn action-raise" id="act-raise-confirm">Onayla</button>
               </div>\` : ''}
          <button type="button" class="action-btn action-allin" id="act-allin">Rest (\${maxBet})</button>
        </div>
      \`;`;
        
        content = content.replace(originalHtmlBlock, newHtmlBlock);
    }
}

// Update event listeners
content = content.replace(
    /document\.getElementById\('act-raise'\)\?\.addEventListener\('click', \(\) => \{\s*socket\.emit\('turkpoker:action', \{ action: 'raise', amount: Number\(slider\.value\) \}\);\s*\}\);/,
    `document.getElementById('act-raise-toggle')?.addEventListener('click', () => {
      document.getElementById('raise-panel').style.display = 'flex';
      document.getElementById('act-raise-toggle').style.display = 'none';
      document.getElementById('act-allin').style.display = 'none';
    });
    document.getElementById('act-raise-confirm')?.addEventListener('click', () => {
      socket.emit('turkpoker:action', { action: 'raise', amount: Number(slider.value) });
    });`
);

fs.writeFileSync(file, content);
console.log("Updated turkpoker.js action bar groups");
