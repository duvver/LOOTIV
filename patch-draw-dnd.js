const fs = require('fs');
let code = fs.readFileSync('public/js/okey101.js', 'utf8');

const oldDrawLogic = `
  // Center deck draw
  if (deckCountEl) {
      deckCountEl.addEventListener('click', () => {
          socket.emit('okey101:draw', { source: 'deck' });
      });
  }
  
  // Previous discard draw (click left discard)
  if (seats.left.discard) {
      seats.left.discard.addEventListener('click', () => {
          socket.emit('okey101:draw', { source: 'discard' });
      });
  }
`;

const newDrawLogic = `
  // Center deck draw
  if (deckCountEl) {
      deckCountEl.addEventListener('click', () => {
          socket.emit('okey101:draw', { source: 'deck' });
      });
      deckCountEl.setAttribute('draggable', 'true');
      deckCountEl.addEventListener('dragstart', (e) => {
          window.drawDragSource = 'deck';
          e.dataTransfer.setData('text/plain', 'draw-deck');
          e.dataTransfer.effectAllowed = 'copyMove';
      });
      deckCountEl.addEventListener('dragend', () => {
          window.drawDragSource = null;
      });
  }
  
  // Previous discard draw (click left discard)
  if (seats.left.discard) {
      seats.left.discard.addEventListener('click', () => {
          socket.emit('okey101:draw', { source: 'discard' });
      });
      seats.left.discard.setAttribute('draggable', 'true');
      seats.left.discard.addEventListener('dragstart', (e) => {
          window.drawDragSource = 'discard';
          e.dataTransfer.setData('text/plain', 'draw-discard');
          e.dataTransfer.effectAllowed = 'copyMove';
      });
      seats.left.discard.addEventListener('dragend', () => {
          window.drawDragSource = null;
      });
  }
`;

code = code.replace(oldDrawLogic.trim(), newDrawLogic.trim());

const oldDropLogic = `
        slotEl.ondrop = (e) => {
            e.preventDefault();
            slotEl.classList.remove('drag-over');
            window.currentDragTarget = null;
            
            if (dragTileId) {
`;

const newDropLogic = `
        slotEl.ondrop = (e) => {
            e.preventDefault();
            slotEl.classList.remove('drag-over');
            window.currentDragTarget = null;
            
            if (window.drawDragSource) {
                socket.emit('okey101:draw', { source: window.drawDragSource });
                window.drawDragSource = null;
                return;
            }
            
            if (dragTileId) {
`;

code = code.replace(oldDropLogic.trim(), newDropLogic.trim());

const oldDragOverLogic = `
            slotEl.classList.add('drag-over');

            if (dragTileId) {
`;

const newDragOverLogic = `
            slotEl.classList.add('drag-over');

            if (window.drawDragSource) return;

            if (dragTileId) {
`;

code = code.replace(oldDragOverLogic.trim(), newDragOverLogic.trim());

fs.writeFileSync('public/js/okey101.js', code);
