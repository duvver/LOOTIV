(() => {
  console.log('[LOOTIV] okey101.js v1 yuklendi');

  const roomId = new URLSearchParams(window.location.search).get('roomId');
  const socket = io({ query: { game: 'okey101', roomId: roomId || '' } });

  // ---------------- DOM ELEMENTS ----------------
  const elTableBadge = document.getElementById('table-badge-id');
  const elInfoElCount = document.getElementById('info-el-count');
  const elInfoPuan = document.getElementById('info-puan');
  
  const seats = {
    top: { 
      seatEl: document.getElementById('seat-top'),
      name: document.getElementById('name-top'), 
      avatar: document.getElementById('avatar-top'), 
      score: document.getElementById('score-top'),
      discard: document.getElementById('discard-top')
    },
    left: { 
      seatEl: document.getElementById('seat-left'),
      name: document.getElementById('name-left'), 
      avatar: document.getElementById('avatar-left'), 
      score: document.getElementById('score-left'),
      discard: document.getElementById('discard-left')
    },
    right: { 
      seatEl: document.getElementById('seat-right'),
      name: document.getElementById('name-right'), 
      avatar: document.getElementById('avatar-right'), 
      score: document.getElementById('score-right'),
      discard: document.getElementById('discard-right')
    },
    bottom: { 
      seatEl: document.getElementById('seat-bottom'),
      name: document.getElementById('name-bottom'), 
      avatar: document.getElementById('avatar-bottom'), 
      score: document.getElementById('score-bottom'),
      discard: document.getElementById('discard-bottom')
    }
  };

  const centerGridMain = document.getElementById('grid-main');
  const centerGridSide = document.getElementById('grid-side');

  const btnSortPairs = document.getElementById('btn-sort-pairs');
  const btnSortSeries = document.getElementById('btn-sort-series');
  const btnOpenPairs = document.getElementById('btn-open-pairs');
  const btnOpenSeries = document.getElementById('btn-open-series');
  
  const deckCountEl = document.getElementById('deck-count');
  const indicatorTileEl = document.getElementById('indicator-tile');
  
  const playerRack = document.getElementById('player-rack');
  const rackRow1 = document.getElementById('rack-row-1');
  const rackRow2 = document.getElementById('rack-row-2');

  const turnAvatar = document.getElementById('turn-avatar');
  const turnName = document.getElementById('turn-name');
  const turnScore = document.getElementById('turn-score');
  const turnNotif = document.getElementById('turn-notif');

  const CURRENT_USER_ID = document.body.dataset.userId ? Number(document.body.dataset.userId) : 0;

  // ---------------- STATE ----------------
  let lastState = null;
  let rackTiles = []; 
  let selectedTiles = new Set();
  let dragTileId = null;

  // ---------------- RENDER HELPERS ----------------
  function getTileHtml(tile, isMini = false) {
    if (!tile) return '';
    let cls = isMini ? 'tile mini' : 'tile'; 
    if (selectedTiles.has(tile.id) && !isMini) cls += ' selected';
    
    if (tile.color === 'red') cls += ' red';
    if (tile.color === 'black') cls += ' black';
    if (tile.color === 'blue') cls += ' blue';
    if (tile.color === 'orange') cls += ' orange';

    if (tile.joker) {
      return `<div class="${cls} black" data-id="${tile.id}">★<span class="dotmark">▾</span></div>`;
    }
    return `<div class="${cls}" data-id="${tile.id}">${tile.number}<span class="dotmark">▾</span></div>`;
  }

  // ---------------- SOCKET EVENTS ----------------
  socket.on('connect', () => {
    console.log('[LOOTIV] Connected to Okey 101 server.');
  });

  socket.on('okey101:state', (state) => {
    lastState = state;
    renderState(state);
  });

  socket.on('okey101:tiles', (tiles) => {
    rackTiles = tiles;
    // Remove selected tiles that are no longer in hand
    const currentIds = new Set(tiles.map(t => t.id));
    for (const id of selectedTiles) {
      if (!currentIds.has(id)) selectedTiles.delete(id);
    }
    renderRack();
  });

  socket.on('okey101:error', (msg) => {
    alert('Hata: ' + msg);
  });

  // ---------------- RENDERING ----------------
  function renderState(state) {
    // 1. Table Info
    elTableBadge.innerHTML = `#${state.tableId}<span class="x">✕</span>`;
    document.getElementById('bottom-table-id').textContent = `#${state.tableId}`;
    
    deckCountEl.textContent = state.deckCount || 0;
    
    if (state.indicator) {
      indicatorTileEl.innerHTML = getTileHtml(state.indicator, true);
    } else {
      indicatorTileEl.innerHTML = '--';
    }

    // 2. Seats
    let myIndex = state.seats.findIndex(s => s && s.userId === CURRENT_USER_ID);
    if (myIndex === -1) myIndex = 0; 
    
    const posMap = {
      bottom: state.seats[myIndex],
      right: state.seats[(myIndex + 1) % 4],
      top: state.seats[(myIndex + 2) % 4],
      left: state.seats[(myIndex + 3) % 4]
    };

    for (const [pos, seat] of Object.entries(posMap)) {
      const el = seats[pos];
      if (seat) {
        el.name.textContent = seat.name || `Oyuncu ${seat.userId}`;
        el.avatar.textContent = (seat.name || '?').substring(0,2).toUpperCase();
        el.score.textContent = seat.score || 0;
        
        // Render discard pile top tile
        if (seat.discardPile && seat.discardPile.length > 0) {
           const topTile = seat.discardPile[seat.discardPile.length - 1];
           el.discard.innerHTML = getTileHtml(topTile, true);
        } else {
           el.discard.innerHTML = '';
        }

        // Highlight turn
        if (state.turnSeat !== null && state.seats[state.turnSeat] && state.seats[state.turnSeat].userId === seat.userId) {
           el.avatar.style.border = "3px solid #f5b942"; 
           if (turnName && turnAvatar && turnScore && turnNotif) {
             turnName.textContent = seat.name;
             turnAvatar.textContent = (seat.name || '?').substring(0,2).toUpperCase();
             turnScore.textContent = seat.score || 0;
             turnNotif.style.display = 'block';
           }
        } else {
           el.avatar.style.border = "";
        }

      } else {
        el.name.textContent = 'Bos';
        el.avatar.textContent = '--';
        el.score.textContent = '0';
        el.discard.innerHTML = '';
      }
    }
    
    // 3. Center Area Grid
    renderCenterGrid(state.boardMelds);
  }

  function renderCenterGrid(boardMelds) {
     const cells = centerGridMain.querySelectorAll('.cell');
     cells.forEach(c => {
         c.innerHTML = '';
         c.removeAttribute('data-meld-id');
     });
     
     if (!boardMelds) return;
     
     let cellIdx = 0;
     boardMelds.forEach(meld => {
        meld.tiles.forEach(tile => {
            if (cellIdx < cells.length) {
                cells[cellIdx].innerHTML = getTileHtml(tile, true);
                cells[cellIdx].setAttribute('data-meld-id', meld.id);
            }
            cellIdx++;
        });
        cellIdx++; // Gap between melds
     });
  }

  function renderRack() {
    rackRow1.innerHTML = '';
    rackRow2.innerHTML = '';
    
    rackTiles.forEach((tile, index) => {
       const html = getTileHtml(tile, false);
       const wrapper = document.createElement('div');
       wrapper.innerHTML = html;
       const tileEl = wrapper.firstElementChild;
       
       tileEl.draggable = true;
       
       // Drag Handlers
       tileEl.ondragstart = (e) => {
           dragTileId = tile.id;
           tileEl.classList.add('dragging');
           e.dataTransfer.setData('text/plain', tile.id);
       };
       tileEl.ondragend = () => {
           dragTileId = null;
           tileEl.classList.remove('dragging');
       };

       // Click Handler for Selection
       tileEl.onclick = () => {
           if (selectedTiles.has(tile.id)) {
               selectedTiles.delete(tile.id);
               tileEl.classList.remove('selected');
           } else {
               selectedTiles.add(tile.id);
               tileEl.classList.add('selected');
           }
       };

       // Drop Handler for sorting (dropping onto another tile to insert before it)
       tileEl.ondragover = (e) => e.preventDefault();
       tileEl.ondrop = (e) => {
           e.preventDefault();
           if (!dragTileId || dragTileId === tile.id) return;
           
           const draggedIdx = rackTiles.findIndex(t => t.id === dragTileId);
           const targetIdx = rackTiles.findIndex(t => t.id === tile.id);
           
           if (draggedIdx !== -1 && targetIdx !== -1) {
               const [draggedTile] = rackTiles.splice(draggedIdx, 1);
               // If dragged from before target, target index shifted by -1
               const insertIdx = (draggedIdx < targetIdx) ? targetIdx : targetIdx;
               rackTiles.splice(insertIdx, 0, draggedTile);
               renderRack(); // Re-render to show new order
           }
       };

       if (index < rackTiles.length / 2) {
           rackRow1.appendChild(tileEl);
       } else {
           rackRow2.appendChild(tileEl);
       }
    });
  }

  // ---------------- UI ACTIONS ----------------
  
  // Sort Buttons
  if (btnSortSeries) {
    btnSortSeries.addEventListener('click', () => {
        rackTiles.sort((a,b) => (a.color === b.color ? a.number - b.number : a.color.localeCompare(b.color)));
        renderRack();
    });
  }

  if (btnSortPairs) {
    btnSortPairs.addEventListener('click', () => {
        rackTiles.sort((a,b) => a.number - b.number);
        renderRack();
    });
  }

  // Helper: Group selected tiles based on adjacency in the rackTiles array
  function getSelectedGroups() {
      if (selectedTiles.size === 0) return [];
      
      const groups = [];
      let currentGroup = [];
      
      for (let i = 0; i < rackTiles.length; i++) {
          const tile = rackTiles[i];
          if (selectedTiles.has(tile.id)) {
              currentGroup.push(tile.id);
          } else {
              if (currentGroup.length > 0) {
                  groups.push(currentGroup);
                  currentGroup = [];
              }
          }
      }
      if (currentGroup.length > 0) {
          groups.push(currentGroup);
      }
      return groups;
  }

  // Open Buttons
  if (btnOpenSeries) {
      btnOpenSeries.addEventListener('click', () => {
          const groups = getSelectedGroups();
          if (groups.length === 0) return alert('Once acmak istediginiz taslari secin.');
          socket.emit('okey101:open', { kind: 'seri', groups });
          selectedTiles.clear();
          renderRack();
      });
  }

  if (btnOpenPairs) {
      btnOpenPairs.addEventListener('click', () => {
          const groups = getSelectedGroups();
          if (groups.length === 0) return alert('Once acmak istediginiz taslari secin.');
          socket.emit('okey101:open', { kind: 'cift', groups });
          selectedTiles.clear();
          renderRack();
      });
  }

  // Discard Drop Zone
  const myDiscardEl = seats.bottom.discard; 
  if (myDiscardEl) {
      myDiscardEl.ondragover = (e) => {
          e.preventDefault();
          myDiscardEl.classList.add('drag-over');
      };
      myDiscardEl.ondragleave = () => {
          myDiscardEl.classList.remove('drag-over');
      };
      myDiscardEl.ondrop = (e) => {
          e.preventDefault();
          myDiscardEl.classList.remove('drag-over');
          if (dragTileId) {
              socket.emit('okey101:discard', { tileId: dragTileId });
              dragTileId = null;
          }
      };
  }

  // Process (İşleme) Drop Zone
  if (centerGridMain) {
      centerGridMain.ondragover = (e) => {
          e.preventDefault(); // allow drop
      };
      centerGridMain.ondrop = (e) => {
          e.preventDefault();
          if (!dragTileId) return;
          
          // Find the closest cell with a data-meld-id
          const targetCell = e.target.closest('.cell[data-meld-id]');
          if (targetCell) {
              const meldId = targetCell.getAttribute('data-meld-id');
              if (meldId) {
                  socket.emit('okey101:process', { tileId: dragTileId, meldId: meldId });
                  dragTileId = null;
              }
          }
      };
  }

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

})();
