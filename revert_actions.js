const fs = require('fs');

// 1. Revert JS
const jsFile = 'C:/Users/eness/Desktop/LOOTIV/public/js/turkpoker.js';
let jsContent = fs.readFileSync(jsFile, 'utf8');

const jsBlockOld = `actionBarEl.innerHTML = \`
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

const jsBlockNew = `actionBarEl.innerHTML = \`
        <button type="button" class="action-btn action-fold" id="act-fold">Pas</button>
        \${toCall > 0
          ? \`<button type="button" class="action-btn action-call" id="act-call">Gör \${toCall}</button>\`
          : \`<button type="button" class="action-btn action-check" id="act-check">Kabul</button>\`}
        \${maxBet > state.currentBet
          ? \`<div class="raise-control">
            <input type="range" id="raise-slider" min="\${minRaiseTo}" max="\${maxBet}" value="\${minRaiseTo}" step="1" />
            <span id="raise-amount">\${minRaiseTo}</span>
            <button type="button" class="action-btn action-raise" id="act-raise">Arttýr</button>
          </div>\` : ''}
        <button type="button" class="action-btn action-allin" id="act-allin">Rest (\${maxBet})</button>
      \`;`;

jsContent = jsContent.replace(jsBlockOld, jsBlockNew);

const jsListenersOld = `document.getElementById('act-raise-toggle')?.addEventListener('click', () => {
      document.getElementById('raise-panel').style.display = 'flex';
      document.getElementById('act-raise-toggle').style.display = 'none';
      document.getElementById('act-allin').style.display = 'none';
    });
    document.getElementById('act-raise-confirm')?.addEventListener('click', () => {
      socket.emit('turkpoker:action', { action: 'raise', amount: Number(slider.value) });
    });`;

const jsListenersNew = `document.getElementById('act-raise')?.addEventListener('click', () => {
      socket.emit('turkpoker:action', { action: 'raise', amount: Number(slider.value) });
    });`;

jsContent = jsContent.replace(jsListenersOld, jsListenersNew);

fs.writeFileSync(jsFile, jsContent);

// 2. Revert CSS
const cssFile = 'C:/Users/eness/Desktop/LOOTIV/public/css/turkpoker.css';
let cssContent = fs.readFileSync(cssFile, 'utf8');

const cssBlockOld = `.action-bar {
    position: absolute;
    bottom: 15px;
    left: 5%;
    width: 90%;
    display: flex;
    justify-content: space-between;
    padding: 6px 12px;
    align-items: center;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s;
    z-index: 50;
  }
  
  .action-group-left, .action-group-right {
    display: flex;
    gap: 10px;
    align-items: center;
  }`;

const cssBlockNew = `.action-bar {
      position: absolute;
      bottom: 5px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 6px;
      padding: 6px 12px;
    align-items: center;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s;
    z-index: 50;
  }`;

cssContent = cssContent.replace(cssBlockOld, cssBlockNew);
fs.writeFileSync(cssFile, cssContent);

console.log("Reverted action bar changes");
