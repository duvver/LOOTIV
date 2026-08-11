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
  const btnShowIndicator = document.getElementById('btn-show-indicator');
  
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
  let rackSlots = new Array(40).fill(null); // 2 rows of 17
  let currentTableId = null;
  let currentHandNumber = -1;
  let selectedTiles = new Set();
  let dragTileId = null;
  let currentOkeySpec = null;

  // ---------------- RENDER HELPERS ----------------
  function getTileHtml(tile, sizeMode = 'normal') {
    if (!tile) return '';
    let cls = 'tile';
    if (sizeMode === 'mini') cls += ' mini';
    else if (sizeMode === 'small') cls += ' small';
    
    if (selectedTiles.has(tile.id) && sizeMode === 'normal') cls += ' selected';
    
    if (tile.color === 'red' || tile.color === 'kirmizi') cls += ' red';
    if (tile.color === 'black' || tile.color === 'siyah') cls += ' black';
    if (tile.color === 'blue' || tile.color === 'mavi') cls += ' blue';
    if (tile.color === 'orange' || tile.color === 'sari') cls += ' orange';

    let isRealOkey = false;
    if (currentOkeySpec && !tile.joker && tile.color === currentOkeySpec.color && tile.number === currentOkeySpec.number) {
        isRealOkey = true;
        cls += ' okey-tile';
    }

    const isWild = tile.joker || isRealOkey;
    const wildAttr = isWild ? ' data-is-wild="true"' : '';

    if (tile.joker) {
      return `<div class="${cls} black" data-id="${tile.id}"${wildAttr}>★<span class="dotmark">▾</span></div>`;
    }
    return `<div class="${cls}" data-id="${tile.id}"${wildAttr}>${tile.number}<span class="dotmark">▾</span></div>`;
  }

  // ---------------- SOCKET EVENTS ----------------
  socket.on('connect', () => {
    console.log('[LOOTIV] Connected to Okey 101 server.');
  });

  socket.on('okey101:reconnect', () => {
    // Show a simple toast message
    let toast = document.getElementById('reconnect-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'reconnect-toast';
      toast.style.position = 'fixed';
      toast.style.top = '20px';
      toast.style.left = '50%';
      toast.style.transform = 'translateX(-50%)';
      toast.style.backgroundColor = '#4caf50';
      toast.style.color = 'white';
      toast.style.padding = '10px 20px';
      toast.style.borderRadius = '5px';
      toast.style.zIndex = '9999';
      toast.style.transition = 'opacity 0.5s';
      toast.innerText = 'Yeniden bağlandınız!';
      document.body.appendChild(toast);
    }
    toast.style.opacity = '1';
    setTimeout(() => {
      toast.style.opacity = '0';
    }, 3000);
  });

  socket.on('okey101:state', (state) => {
    // Reset rack if joining a new room or a new hand starts
    if (state.tableId !== currentTableId || state.handNumber !== currentHandNumber) {
        rackSlots = new Array(40).fill(null);
        selectedTiles.clear();
        dragTileId = null;
        currentTableId = state.tableId;
        currentHandNumber = state.handNumber;
    }

    lastState = state;
    
    if (state.indicator) {
        currentOkeySpec = {
            color: state.indicator.color,
            number: state.indicator.number === 13 ? 1 : state.indicator.number + 1
        };
    } else {
        currentOkeySpec = null;
    }

    // Auto-sit logic: if we are not seated and there's an empty seat, sit automatically.
    const isSeated = state.seats.some(s => s && s.userId === CURRENT_USER_ID);
    if (!isSeated) {
      const firstEmptyIndex = state.seats.findIndex(s => s === null);
      if (firstEmptyIndex !== -1) {
        socket.emit('okey101:sit', { seatIndex: firstEmptyIndex });
      }
    }
    
    renderState(state);
  });

  socket.on('okey101:tiles', (tiles) => {
    const payloadTiles = new Map(tiles.map(t => [t.id, t]));
    
    // 1. Remove tiles from rackSlots that are no longer in payload
    for (let i = 0; i < rackSlots.length; i++) {
        const t = rackSlots[i];
        if (t && !payloadTiles.has(t.id)) {
            rackSlots[i] = null;
        }
    }
    
    // 2. Add new tiles that are not currently in rackSlots
    const currentSlotTiles = new Set(rackSlots.filter(t => t !== null).map(t => t.id));
    
    let nextEmpty = 0;
    for (const tile of tiles) {
        if (!currentSlotTiles.has(tile.id)) {
            // Find next empty slot
            while (nextEmpty < rackSlots.length && rackSlots[nextEmpty] !== null) {
                nextEmpty++;
            }
            if (nextEmpty < rackSlots.length) {
                rackSlots[nextEmpty] = tile;
            } else {
                rackSlots.push(tile); // fallback
            }
        } else {
            // Update reference (for joker flag / colors)
            const idx = rackSlots.findIndex(t => t && t.id === tile.id);
            if (idx !== -1) rackSlots[idx] = tile;
        }
    }
    
    // Remove selected state if tile removed
    for (const id of selectedTiles) {
      if (!payloadTiles.has(id)) selectedTiles.delete(id);
    }
    renderRack();
  });

  socket.on('okey101:error', (msg) => {
    // alert yerine şık bir toast (Glow/Navy theme uyumlu)
    const container = document.getElementById('toast-container');
    if (!container) {
        alert('Hata: ' + msg); // Fallback
        return;
    }
    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.textContent = msg;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 500);
    }, 3000);
  });

  socket.on('okey101:game-over', (data) => {
      let finalScores = data && data.totalScores ? data.totalScores : {};
      if (!gameOverOverlay) {
        gameOverOverlay = document.createElement('div');
        gameOverOverlay.id = 'game-over-overlay';
        document.body.appendChild(gameOverOverlay);
      }
      let html = `
          <div class="go-box">
            <h2>Oyun Bitti!</h2>
            <p>Tüm eller tamamlandı. Sonuçlar:</p>
            <ol style="text-align:left; padding-left:40px; margin-bottom:20px;">
      `;
      const seats = lastState && lastState.seats ? lastState.seats : [];
      const scoresArr = Object.entries(finalScores).map(([uid, score]) => {
          const seat = seats.find(s => s && s.userId == uid);
          return { name: seat ? seat.name : `Oyuncu ${uid}`, score };
      }).sort((a,b) => a.score - b.score);
      scoresArr.forEach(s => {
          html += `<li>${s.name}: ${s.score} Puan</li>`;
      });
      html += `</ol><button onclick="window.location.href='/lobiler'" style="margin-top:20px; padding:10px 20px; background:#f5b942; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">Ana Menüye Dön</button></div>`;
      gameOverOverlay.innerHTML = html;
      gameOverOverlay.style.display = 'flex';
  });

  let currentTurnDeadline = null;
  let gameOverOverlay = null;

  setInterval(() => {
    if (!currentTurnDeadline) {
      document.querySelectorAll('.seat-timer-display').forEach(el => el.textContent = '');
      return;
    }
    const ms = currentTurnDeadline - Date.now();
    const secs = Math.max(0, Math.floor(ms / 1000));
    document.querySelectorAll('.seat-turn-active .seat-timer-display').forEach(el => {
      el.textContent = `${secs}s`;
    });
  }, 1000);

  function renderState(state) {
    currentTurnDeadline = state.turnDeadline;

    if (state.stage === 'finished' || state.stage === 'game-over') {
      if (!gameOverOverlay) {
        gameOverOverlay = document.createElement('div');
        gameOverOverlay.id = 'game-over-overlay';
        gameOverOverlay.innerHTML = `
          <div class="go-box">
            <h2>Oyun Bitti!</h2>
            <p>Bu el sona erdi. Puan tablosu güncelleniyor...</p>
            <button onclick="window.location.reload()" style="margin-top:20px; padding:10px 20px; background:#f5b942; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">Yenile</button>
          </div>
        `;
        document.body.appendChild(gameOverOverlay);
      }
      
      if (state.stage === 'game-over') {
          let html = `<h2>Oyun Bitti!</h2><p>Tüm eller tamamlandı. Sonuçlar:</p>`;
          if (state.totalScores) {
              const scores = Object.entries(state.totalScores).map(([uid, score]) => {
                  const seat = state.seats.find(s => s && s.userId == uid);
                  return { name: seat ? seat.name : `Oyuncu ${uid}`, score };
              }).sort((a,b) => a.score - b.score);
              html += `<ol style="text-align:left; padding-left:40px; margin-bottom:20px;">`;
              scores.forEach(s => html += `<li>${s.name}: ${s.score} Puan</li>`);
              html += `</ol>`;
          }
          html += `<button onclick="window.location.href='/lobiler'" style="margin-top:20px; padding:10px 20px; background:#f5b942; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">Lobiler</button>`;
          gameOverOverlay.querySelector('.go-box').innerHTML = html;
      }
      
      gameOverOverlay.style.display = 'flex';
    } else {
      if (gameOverOverlay) gameOverOverlay.style.display = 'none';
    }
    
    // 1. Table Info
    const myCurrentSeat = state.seats ? state.seats.find(s => s && s.userId === CURRENT_USER_ID) : null;
    
    if (elInfoElCount) elInfoElCount.textContent = state.handNumber || 0;
    if (elInfoPuan) elInfoPuan.textContent = (myCurrentSeat ? myCurrentSeat.totalScore : 0) + ' PUAN';

    elTableBadge.innerHTML = `#${state.tableId}<span class="x">✕</span>`;
    document.getElementById('bottom-table-id').textContent = `#${state.tableId}`;
    
    deckCountEl.textContent = state.deckCount || 0;
    
    if (state.indicator) {
      indicatorTileEl.innerHTML = getTileHtml(state.indicator, 'small');
    } else {
      indicatorTileEl.innerHTML = '--';
    }

    // 2. Seats
    let myIndex = state.seats.findIndex(s => s && s.userId === CURRENT_USER_ID);
    if (myIndex === -1) myIndex = 0; 
    
    const posMap = {
      bottom: { seat: state.seats[myIndex], index: myIndex },
      right: { seat: state.seats[(myIndex + 1) % 4], index: (myIndex + 1) % 4 },
      top: { seat: state.seats[(myIndex + 2) % 4], index: (myIndex + 2) % 4 },
      left: { seat: state.seats[(myIndex + 3) % 4], index: (myIndex + 3) % 4 }
    };

    for (const [pos, data] of Object.entries(posMap)) {
      const el = seats[pos];
      const seat = data.seat;
      const actualIndex = data.index;

      if (seat) {
        el.name.innerHTML = seat.name || `Oyuncu ${seat.userId}`;
        el.avatar.innerHTML = (seat.name || '?').substring(0,2).toUpperCase();
        el.score.textContent = seat.totalScore || 0;
        
        // Render discard pile top tile
        const pile = state.discardPiles && state.discardPiles[actualIndex];
        if (pile && pile.top) {
           el.discard.innerHTML = getTileHtml(pile.top, 'small');
        } else {
           el.discard.innerHTML = '';
        }

        // Highlight turn
        if (state.turnSeat !== null && state.seats[state.turnSeat] && state.seats[state.turnSeat].userId === seat.userId) {
           el.avatar.style.border = "3px solid #f5b942"; 
           el.seatEl.classList.add('seat-turn-active');
           let timerEl = el.seatEl.querySelector('.seat-timer-display');
           if (!timerEl) {
               timerEl = document.createElement('div');
               timerEl.className = 'seat-timer-display';
               el.name.parentNode.appendChild(timerEl);
           }

           if (turnName && turnAvatar && turnScore && turnNotif) {
             turnName.textContent = seat.name;
             turnAvatar.textContent = (seat.name || '?').substring(0,2).toUpperCase();
             turnScore.textContent = seat.totalScore || 0;
             turnNotif.style.display = 'block';
           }
        } else {
           el.avatar.style.border = "";
           el.seatEl.classList.remove('seat-turn-active');
           let timerEl = el.seatEl.querySelector('.seat-timer-display');
           if (timerEl) timerEl.remove();
        }

      } else {
        el.name.innerHTML = `<span class="btn-add-bot" data-seat="${actualIndex}">[+] Bot Ekle</span>`;
        el.avatar.innerHTML = '--';
        el.score.textContent = '0';
        el.discard.innerHTML = '';
        el.avatar.style.border = "";
      }
    }
    
    // 3. Center Area Grid
    renderCenterGrid(state.boardMelds);
    
    // Bug-L: Disable open buttons if opened
    if (btnOpenPairs) btnOpenPairs.disabled = myCurrentSeat && myCurrentSeat.hasOpened;
    if (btnOpenSeries) btnOpenSeries.disabled = myCurrentSeat && myCurrentSeat.hasOpened;
    [btnOpenPairs, btnOpenSeries].forEach(btn => {
        if (btn) {
            if (btn.disabled) {
                btn.style.opacity = '0.5';
                btn.style.pointerEvents = 'none';
            } else {
                btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';
            }
        }
    });

    // Bug-M: mustOpenThisTurn banner
    let banner = document.getElementById('must-open-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'must-open-banner';
        banner.style.position = 'absolute';
        banner.style.top = '15%';
        banner.style.left = '50%';
        banner.style.transform = 'translateX(-50%)';
        banner.style.background = 'rgba(231, 76, 60, 0.9)';
        banner.style.color = 'white';
        banner.style.padding = '10px 20px';
        banner.style.borderRadius = '5px';
        banner.style.zIndex = '1000';
        banner.style.fontWeight = 'bold';
        document.body.appendChild(banner);
    }
    
    if (myCurrentSeat && myCurrentSeat.mustOpenThisTurn) {
        const undoBtnHtml = `<button id="btn-undo-draw" onclick="socket.emit('okey101:undoDraw')" style="margin-left:10px; padding:5px; background:#c0392b; color:#fff; border:none; border-radius:3px; cursor:pointer;">Geri Bırak</button>`;
        banner.innerHTML = `Yerden taş aldınız — elinizi açmanız veya geri bırakmanız gerekiyor! ${undoBtnHtml}`;
        banner.style.display = 'block';
    } else {
        banner.style.display = 'none';
    }

    // Bug-N: Show indicator button
    if (btnShowIndicator) {
        btnShowIndicator.style.display = (myCurrentSeat && myCurrentSeat.canShowIndicator && !myCurrentSeat.hasShownIndicator) ? '' : 'none';
    }
  }

  function renderCenterGrid(boardMelds) {
     const mainCells = centerGridMain.querySelectorAll('.cell');
     mainCells.forEach(c => {
         c.innerHTML = '';
         c.removeAttribute('data-meld-id');
     });
     
     let sideCells = null;
     if (centerGridSide) {
         sideCells = centerGridSide.querySelectorAll('.cell');
         sideCells.forEach(c => {
             c.innerHTML = '';
             c.removeAttribute('data-meld-id');
         });
     }
     
     if (!boardMelds) return;
     
     let mainRowIdx = 0;
     let sideRowIdx = 0;
     
     boardMelds.forEach(meld => {
        let colIdx = 0;
        const isCift = meld.kind === 'cift';
        const targetCells = isCift && sideCells ? sideCells : mainCells;
        const targetRow = isCift && sideCells ? sideRowIdx : mainRowIdx;
        const colsPerRow = isCift && sideCells ? 6 : 26; // Side grid has 6 columns, main 26
        
        for (let c = 0; c < colsPerRow; c++) {
            let cellIdx = (targetRow * colsPerRow) + c;
            if (cellIdx < targetCells.length) {
                targetCells[cellIdx].setAttribute('data-meld-id', meld.id);
            }
        }

        meld.tiles.forEach(tile => {
            let cellIdx = (targetRow * colsPerRow) + colIdx;
            if (cellIdx < targetCells.length) {
                targetCells[cellIdx].innerHTML = getTileHtml(tile, 'mini');
            }
            colIdx++; // Mini tile (16x22) spans exactly 1 grid cell now
        });
        
        if (isCift && sideCells) {
            sideRowIdx++;
        } else {
            mainRowIdx++;
        }
     });
  }

  function renderRack() {
    rackRow1.innerHTML = '';
    rackRow2.innerHTML = '';
    
    for (let i = 0; i < 40; i++) {
        const slotEl = document.createElement('div');
        slotEl.className = 'rack-slot';
        slotEl.dataset.index = i;
        
        slotEl.ondragover = (e) => { 
            e.preventDefault(); 
            if (window.currentDragTarget === i) return;
            window.currentDragTarget = i;

            document.querySelectorAll('.rack-slot').forEach(el => {
                el.classList.remove('shift-left', 'shift-right');
            });
            slotEl.classList.add('drag-over');

            if (window.drawDragSource) return;

            if (dragTileId) {
                const srcIdx = rackSlots.findIndex(t => t && t.id === dragTileId);
                const targetIdx = i;
                if (srcIdx !== -1 && srcIdx !== targetIdx && rackSlots[targetIdx]) {
                    const vSlots = [...rackSlots];
                    vSlots[srcIdx] = null;
                    
                    const isRow1 = targetIdx < 20;
                    const rowStart = isRow1 ? 0 : 20;
                    const rowEnd = isRow1 ? 19 : 39;

                    let leftEmpty = -1;
                    for (let step = 1; step <= 20; step++) {
                        if (targetIdx - step >= rowStart && vSlots[targetIdx - step] === null) { leftEmpty = targetIdx - step; break; }
                    }
                    let rightEmpty = -1;
                    for (let step = 1; step <= 20; step++) {
                        if (targetIdx + step <= rowEnd && vSlots[targetIdx + step] === null) { rightEmpty = targetIdx + step; break; }
                    }

                    let E = -1;
                    if (leftEmpty !== -1 && rightEmpty !== -1) {
                        E = (targetIdx - leftEmpty) <= (rightEmpty - targetIdx) ? leftEmpty : rightEmpty;
                    } else if (leftEmpty !== -1) {
                        E = leftEmpty;
                    } else if (rightEmpty !== -1) {
                        E = rightEmpty;
                    }

                    if (E !== -1) {
                        if (E < targetIdx) {
                            for (let k = E + 1; k <= targetIdx; k++) {
                                const el = document.querySelector(`.rack-slot[data-index="${k}"]`);
                                if (el) el.classList.add('shift-left');
                            }
                        } else if (E > targetIdx) {
                            for (let k = targetIdx; k <= E - 1; k++) {
                                const el = document.querySelector(`.rack-slot[data-index="${k}"]`);
                                if (el) el.classList.add('shift-right');
                            }
                        }
                    }
                }
            }
        };
        
        slotEl.ondragleave = () => {
            slotEl.classList.remove('drag-over');
        };
        
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
                const srcIdx = rackSlots.findIndex(t => t && t.id === dragTileId);
                const targetIdx = i;
                if (srcIdx !== -1 && srcIdx !== targetIdx) {
                    if (!rackSlots[targetIdx]) {
                        rackSlots[targetIdx] = rackSlots[srcIdx];
                        rackSlots[srcIdx] = null;
                    } else {
                        const tileToMove = rackSlots[srcIdx];
                        rackSlots[srcIdx] = null; 

                        const isRow1 = targetIdx < 20;
                        const rowStart = isRow1 ? 0 : 20;
                        const rowEnd = isRow1 ? 19 : 39;

                        let leftEmpty = -1;
                        for (let step = 1; step <= 20; step++) {
                            if (targetIdx - step >= rowStart && rackSlots[targetIdx - step] === null) { leftEmpty = targetIdx - step; break; }
                        }
                        let rightEmpty = -1;
                        for (let step = 1; step <= 20; step++) {
                            if (targetIdx + step <= rowEnd && rackSlots[targetIdx + step] === null) { rightEmpty = targetIdx + step; break; }
                        }

                        let E = -1;
                        if (leftEmpty !== -1 && rightEmpty !== -1) {
                            E = (targetIdx - leftEmpty) <= (rightEmpty - targetIdx) ? leftEmpty : rightEmpty;
                        } else if (leftEmpty !== -1) {
                            E = leftEmpty;
                        } else if (rightEmpty !== -1) {
                            E = rightEmpty;
                        }

                        if (E !== -1) {
                            if (E < targetIdx) {
                                for (let k = E; k < targetIdx; k++) {
                                    rackSlots[k] = rackSlots[k + 1];
                                }
                            } else if (E > targetIdx) {
                                for (let k = E; k > targetIdx; k--) {
                                    rackSlots[k] = rackSlots[k - 1];
                                }
                            }
                            rackSlots[targetIdx] = tileToMove;
                        } else {
                            const temp = rackSlots[targetIdx];
                            rackSlots[targetIdx] = tileToMove;
                            rackSlots[srcIdx] = temp;
                        }
                    }
                    renderRack();
                }
            }
        };

        const tile = rackSlots[i];
        if (tile) {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = getTileHtml(tile, 'normal');
            const tileEl = wrapper.firstElementChild;
            
            tileEl.draggable = true;
            tileEl.ondragstart = (e) => {
                dragTileId = tile.id;
                const container = document.getElementById('rack-container');
                if (container) container.classList.add('rack-is-dragging');
                setTimeout(() => tileEl.classList.add('dragging'), 0);
                e.dataTransfer.setData('text/plain', tile.id);
            };
            tileEl.ondragend = () => {
                dragTileId = null;
                const container = document.getElementById('rack-container');
                if (container) container.classList.remove('rack-is-dragging');
                tileEl.classList.remove('dragging');
                document.querySelectorAll('.rack-slot').forEach(el => el.classList.remove('shift-left', 'shift-right', 'drag-over'));
                window.currentDragTarget = null;
            };
            tileEl.onclick = () => {
                if (selectedTiles.has(tile.id)) {
                    selectedTiles.delete(tile.id);
                    tileEl.classList.remove('selected');
                } else {
                    selectedTiles.add(tile.id);
                    tileEl.classList.add('selected');
                }
            };
            slotEl.appendChild(tileEl);
        }
        
        if (i < 20) {
            rackRow1.appendChild(slotEl);
        } else {
            rackRow2.appendChild(slotEl);
        }
    }
    
    // Anlık 101 Puan Hesaplaması
    calculateHandPoints();
  }

  function calculateHandPoints() {
    let totalScore = 0;
    const groups = [];
    let currentGroup = [];

    // Yan yana duran taşları grupla (boşluklarla ayrılmış)
    for (let i = 0; i < rackSlots.length; i++) {
        const tile = rackSlots[i];
        if (tile) {
            currentGroup.push(tile);
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

    // Basit Puan Hesaplaması (Prototip: Geçerli perlerin değerlerini topla)
    groups.forEach(g => {
        if (g.length >= 3) {
            // Gerçek 101 mantığı sunucuda çalışır, bu sadece UI mock hesabı
            let groupScore = g.reduce((sum, t) => sum + (t.number || 0), 0);
            totalScore += groupScore;
        }
    });

    const handScoreEl = document.getElementById('hand-score');
    if (handScoreEl) {
        handScoreEl.textContent = totalScore;
    }

    // Masaya Aç butonu parlatma efekti
    if (btnOpenSeries) {
        if (totalScore >= 101) {
            btnOpenSeries.classList.add('btn-glow-active');
        } else {
            btnOpenSeries.classList.remove('btn-glow-active');
        }
    }
  }

  // ---------------- UI ACTIONS ----------------
  
  // Table Badge Exit
  if (elTableBadge) {
      elTableBadge.addEventListener('click', (e) => {
          if (e.target.classList.contains('x')) {
              socket.emit('okey101:stand');
              window.location.href = '/';
          }
      });
  }

  // Add Bot (Delegated click)
  document.body.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-add-bot')) {
          const seatIndex = Number(e.target.dataset.seat);
          socket.emit('okey101:addbot', { seatIndex });
      }
  });

  // ---------------- ADVANCED SORTING ALGORITHMS ----------------
  function layoutGroups(groups) {
      const tilesCount = groups.reduce((acc, g) => acc + g.length, 0);
      const maxGaps = 40 - tilesCount;
      
      // Merge groups if we exceed available gaps
      while (groups.length - 1 > maxGaps && groups.length > 1) {
          const last = groups.pop();
          groups[groups.length - 1].push(...last);
      }
      
      rackSlots.fill(null);
      let currentIdx = 0;
      
      for (let i = 0; i < groups.length; i++) {
          const group = groups[i];
          
          if (currentIdx < 20) {
              const tilesRemaining = groups.slice(i).reduce((acc, g) => acc + g.length, 0);
              const groupsRemaining = groups.length - i;
              const slotsNeeded = tilesRemaining + groupsRemaining - 1;
              
              // Wrap to bottom row if group overflows top, or if we are midway and bottom has room
              if (currentIdx + group.length > 20 || (currentIdx >= 10 && slotsNeeded <= 20)) {
                  currentIdx = 20;
              }
          }
          
          for (const tile of group) {
              if (currentIdx < 40) {
                  rackSlots[currentIdx] = tile;
                  currentIdx++;
              }
          }
          currentIdx++; // Add gap
      }
      
      // Fallback for any lost tiles
      const placedIds = new Set(rackSlots.filter(t => t).map(t => t.id));
      const allTiles = groups.flat();
      for (const tile of allTiles) {
          if (!placedIds.has(tile.id)) {
              const emptyIdx = rackSlots.indexOf(null);
              if (emptyIdx !== -1) rackSlots[emptyIdx] = tile;
          }
      }
      
      renderRack();
  }

  function getSeriesGroups(tiles) {
      const groups = [];
      let pool = [...tiles];
      
      // 1. Find Pers (Sets: 3 or 4 of same number, different colors)
      const numberMap = {};
      pool.forEach(t => {
          if (!numberMap[t.number]) numberMap[t.number] = [];
          numberMap[t.number].push(t);
      });
      
      const newPool = [];
      for (const num in numberMap) {
          const tList = numberMap[num];
          const colors = new Set();
          const per = [];
          const remainder = [];
          
          tList.forEach(t => {
              if (!colors.has(t.color)) {
                  colors.add(t.color);
                  per.push(t);
              } else {
                  remainder.push(t);
              }
          });
          
          if (per.length >= 3) {
              groups.push(per);
              newPool.push(...remainder);
          } else {
              newPool.push(...tList);
          }
      }
      
      pool = newPool;
      
      // 2. Find Runs (Series: 3+ consecutive numbers of same color)
      pool.sort((a,b) => {
          const cA = a.color || '';
          const cB = b.color || '';
          const nA = a.number || 0;
          const nB = b.number || 0;
          return cA === cB ? nA - nB : cA.localeCompare(cB);
      });
      
      let currentRun = [];
      const leftovers = [];
      
      for (let i = 0; i < pool.length; i++) {
          const curr = pool[i];
          if (currentRun.length === 0) {
              currentRun.push(curr);
          } else {
              const prev = currentRun[currentRun.length - 1];
              if (curr.color === prev.color && curr.number === prev.number + 1) {
                  currentRun.push(curr);
              } else if (curr.color === prev.color && curr.number === prev.number) {
                  leftovers.push(curr);
              } else {
                  if (currentRun.length >= 3) {
                      groups.push(currentRun);
                  } else {
                      leftovers.push(...currentRun);
                  }
                  currentRun = [curr];
              }
          }
      }
      if (currentRun.length >= 3) {
          groups.push(currentRun);
      } else {
          leftovers.push(...currentRun);
      }
      
      // 3. Group leftovers intelligently (by color)
      leftovers.sort((a,b) => {
          const cA = a.color || '';
          const cB = b.color || '';
          const nA = a.number || 0;
          const nB = b.number || 0;
          return cA === cB ? nA - nB : cA.localeCompare(cB);
      });
      
      let currentColorGroup = [];
      for (const t of leftovers) {
          if (currentColorGroup.length === 0) {
              currentColorGroup.push(t);
          } else {
              if (currentColorGroup[0].color === t.color) {
                  currentColorGroup.push(t);
              } else {
                  groups.push(currentColorGroup);
                  currentColorGroup = [t];
              }
          }
      }
      if (currentColorGroup.length > 0) {
          groups.push(currentColorGroup);
      }
      
      return groups;
  }

  function getPairGroups(tiles) {
      const counts = {};
      tiles.forEach(t => {
          const key = t.color + '-' + t.number;
          if (!counts[key]) counts[key] = [];
          counts[key].push(t);
      });
      
      const groups = [];
      const leftovers = [];
      
      // Extract exact identical pairs
      for (const key in counts) {
          const tList = counts[key];
          while (tList.length >= 2) {
              groups.push([tList.shift(), tList.shift()]);
          }
          if (tList.length === 1) leftovers.push(tList[0]);
      }
      
      // Group leftovers by color to prevent chaos
      leftovers.sort((a,b) => {
          const cA = a.color || '';
          const cB = b.color || '';
          const nA = a.number || 0;
          const nB = b.number || 0;
          return cA === cB ? nA - nB : cA.localeCompare(cB);
      });
      let currentColorGroup = [];
      for (const t of leftovers) {
          if (currentColorGroup.length === 0) {
              currentColorGroup.push(t);
          } else {
              if (currentColorGroup[0].color === t.color) {
                  currentColorGroup.push(t);
              } else {
                  groups.push(currentColorGroup);
                  currentColorGroup = [t];
              }
          }
      }
      if (currentColorGroup.length > 0) {
          groups.push(currentColorGroup);
      }
      
      return groups;
  }

  if (btnShowIndicator) {
      btnShowIndicator.addEventListener('click', () => {
          socket.emit('okey101:showIndicator');
      });
  }

  if (btnSortSeries) {
      btnSortSeries.addEventListener('click', () => {
          const tiles = rackSlots.filter(t => t !== null);
          layoutGroups(getSeriesGroups(tiles));
      });
  }

  if (btnSortPairs) {
    btnSortPairs.addEventListener('click', () => {
        const tiles = rackSlots.filter(t => t !== null);
        layoutGroups(getPairGroups(tiles));
    });
  }

  // Helper: Group selected tiles based on adjacency in the rackSlots array


  function isWild(tile, okeySpec) {
      return !tile.joker && okeySpec && tile.color === okeySpec.color && tile.number === okeySpec.number;
  }
  function getEffectiveTile(tile, okeySpec) {
      if (tile.joker && okeySpec) {
          return { ...tile, color: okeySpec.color, number: okeySpec.number, joker: true };
      }
      return tile;
  }

  function isValidGroupOnClient(tileIds, type) {
      const tiles = tileIds.map(id => rackSlots.find(t => t && t.id === id)).filter(Boolean);
      if (tiles.length !== tileIds.length) return false;
      const okeySpec = currentOkeySpec;
      
      const effTiles = tiles.map(t => getEffectiveTile(t, okeySpec));
      const normals = effTiles.filter(t => !isWild(t, okeySpec));
      
      if (type === 'cift') {
          if (tiles.length !== 2) return false;
          if (normals.length === 2) {
              return normals[0].color === normals[1].color && normals[0].number === normals[1].number;
          }
          return true; // 1 or 0 normal tiles, assume wildcard covers it
      } else {
          if (tiles.length < 3) return false;
          if (normals.length < 2) return true;
          
          // Check Per
          const isPer = normals.every(t => t.number === normals[0].number);
          if (isPer) {
              const uniqueColors = new Set(normals.map(t => t.color));
              if (uniqueColors.size === normals.length) return true;
          }
          
          // Check Seri
          const isSeri = normals.every(t => t.color === normals[0].color);
          if (isSeri) {
              const sorted = [...normals].sort((a,b) => a.number - b.number);
              let has13 = false, has1 = false;
              for(const t of sorted) {
                  if (t.number===13) has13=true;
                  if (t.number===1) has1=true;
              }
              let span = sorted[sorted.length-1].number - sorted[0].number + 1;
              if (has13 && has1) {
                  const adjusted = sorted.map(t => t.number === 1 ? 14 : t.number).sort((a,b)=>a-b);
                  span = adjusted[adjusted.length-1] - adjusted[0] + 1;
              }
              if (span <= tiles.length && (new Set(normals.map(t=>t.number)).size === normals.length)) {
                  return true;
              }
          }
          return false;
      }
  }

  function getGroupsFromRack(type) {
      if (selectedTiles.size > 0) {
          const groups = [];
          let currentGroup = [];
          for (let i = 0; i < rackSlots.length; i++) {
              const tile = rackSlots[i];
              if (tile && selectedTiles.has(tile.id)) {
                  currentGroup.push(tile.id);
              } else {
                  if (currentGroup.length > 0) {
                      groups.push(currentGroup);
                      currentGroup = [];
                  }
              }
          }
          if (currentGroup.length > 0) {
              if (isValidGroupOnClient(currentGroup, type)) groups.push(currentGroup);
          }
          return groups;
      } else {
          // Auto-detect based on empty slots
          const groups = [];
          let currentGroup = [];
          for (let i = 0; i < rackSlots.length; i++) {
              const tile = rackSlots[i];
              if (tile) {
                  currentGroup.push(tile.id);
              } else {
                  if (isValidGroupOnClient(currentGroup, type)) {
                      groups.push(currentGroup);
                  }
                  currentGroup = [];
              }
          }
          if (type === 'cift' && currentGroup.length === 2) {
              groups.push(currentGroup);
          } else if (type === 'seri' && currentGroup.length >= 3) {
              groups.push(currentGroup);
          }
          return groups;
      }
  }

  // Open Buttons
  if (btnOpenSeries) {
      btnOpenSeries.addEventListener('click', () => {
          const groups = getGroupsFromRack('seri');
          if (groups.length === 0) return alert('Açılacak en az 3 taşlı geçerli bir grup bulunamadı.');
          socket.emit('okey101:open', { kind: 'seri', groups });
          selectedTiles.clear();
          renderRack();
      });
  }

  if (btnOpenPairs) {
      btnOpenPairs.addEventListener('click', () => {
          const groups = getGroupsFromRack('cift');
          if (groups.length === 0) return alert('Açılacak 2 taşlı çift grupları bulunamadı.');
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
          const targetCell = e.target.closest('.cell');
          document.querySelectorAll('.center-area .cell.drag-target').forEach(el => el.classList.remove('drag-target'));
          if (targetCell && dragTileId) {
              targetCell.classList.add('drag-target');
          }
      };
      centerGridMain.ondragleave = (e) => {
          const targetCell = e.target.closest('.cell');
          if (targetCell) {
              targetCell.classList.remove('drag-target');
          }
      };
      centerGridMain.ondrop = (e) => {
          document.querySelectorAll('.center-area .cell.drag-target').forEach(el => el.classList.remove('drag-target'));
          e.preventDefault();
          if (!dragTileId) return;
          
          // Find the closest tile element inside the dropped area
          const targetTile = e.target.closest('.tile');
          let isWild = false;
          if (targetTile && targetTile.getAttribute('data-is-wild') === 'true') {
              isWild = true;
          }

          // Find the closest cell with a data-meld-id
          const targetCell = e.target.closest('.cell[data-meld-id]');
          if (targetCell) {
              const meldId = targetCell.getAttribute('data-meld-id');
              if (meldId) {
                  if (isWild) {
                      socket.emit('okey101:swapJoker', { tileId: dragTileId, meldId: meldId });
                  } else {
                      socket.emit('okey101:process', { tileId: dragTileId, meldId: meldId });
                  }
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

  // --- YENİ BUTON İŞLEVLENDİRMELERİ ---

  // 1. MASALAR
  const btnMasalar = document.querySelector('.btn-masalar');
  if (btnMasalar) {
    btnMasalar.addEventListener('click', () => {
      window.location.href = '/lobiler'; // Ana lobiye dön
    });
  }

  // 2. Oyundan Çık (table-badge)
  const btnExit = document.querySelector('.table-badge');
  if (btnExit) {
    btnExit.addEventListener('click', () => {
      if (confirm('Oyundan ayrılmak istediğinize emin misiniz?')) {
        socket.emit('okey101:leave_table');
        window.location.href = '/lobiler';
      }
    });
  }

  // 3. HEMEN OYNA!
  const btnPlay = document.querySelector('.btn-play');
  if (btnPlay) {
    btnPlay.addEventListener('click', () => {
      if (confirm('Mevcut masadan ayrılıp yeni bir masaya geçmek istiyor musunuz?')) {
        socket.emit('okey101:leave_table');
        socket.emit('okey101:join_random');
      }
    });
  }

  // 4. Modal Yardımcı Fonksiyonlar
  function openModal(id) {
    const m = document.getElementById(id);
    if (m) m.style.display = 'flex';
  }
  function closeModal(id) {
    const m = document.getElementById(id);
    if (m) m.style.display = 'none';
  }

  document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.game-modal');
      if (modal) modal.style.display = 'none';
    });
  });

  // Market
  const btnMarket = document.querySelector('.ic[aria-label="Market"]');
  if (btnMarket) btnMarket.addEventListener('click', () => openModal('modal-market'));

  // Ayarlar
  const btnSettingsTop = document.querySelector('.ic[aria-label="Ayarlar"]');
  const btnSettingsGear = document.querySelector('.gear-round');
  if (btnSettingsTop) btnSettingsTop.addEventListener('click', () => openModal('modal-settings'));
  if (btnSettingsGear) btnSettingsGear.addEventListener('click', () => openModal('modal-settings'));

  // Bildirimler
  const btnNotif = document.querySelector('.bell');
  if (btnNotif) btnNotif.addEventListener('click', () => openModal('modal-notifs'));

  // Beğen (Kalp)
  const btnHeart = document.querySelector('.ic.heart');
  if (btnHeart) {
    btnHeart.addEventListener('click', () => {
      btnHeart.style.color = '#ff4d4d'; // Geçici animasyon rengi
      setTimeout(() => btnHeart.style.color = '', 500);
      socket.emit('okey101:send_like');
    });
  }

  // Yenile
  const btnSync = document.querySelector('.mini-ic[aria-label="Yenile"]');
  if (btnSync) {
    btnSync.addEventListener('click', () => {
      socket.emit('okey101:request_sync');
    });
  }

  // Dondur
  const btnFreeze = document.querySelector('.mini-ic[aria-label="Dondur"]');
  if (btnFreeze) {
    btnFreeze.addEventListener('click', () => {
      alert('Masayı dondurmak için oylama başlatılıyor...');
      socket.emit('okey101:request_freeze');
    });
  }

  // Panoya Kopyala
  const btnCopy = document.querySelector('.mini-ic[aria-label="Panoya Kopyala"]');
  if (btnCopy) {
    btnCopy.addEventListener('click', () => {
      navigator.clipboard.writeText('Masa ID: ' + window.location.pathname.split('/').pop())
        .then(() => alert('Masa bilgisi kopyalandı!'))
        .catch(() => alert('Kopyalama başarısız!'));
    });
  }

  // Sohbet Panel Toggle
  const btnChat = document.querySelector('.chat-ic');
  const panelChat = document.getElementById('panel-chat');
  const btnCloseChat = document.querySelector('.close-chat');
  if (btnChat && panelChat) {
    btnChat.addEventListener('click', () => {
      panelChat.style.display = panelChat.style.display === 'none' ? 'flex' : 'none';
    });
  }
  if (btnCloseChat && panelChat) {
    btnCloseChat.addEventListener('click', () => {
      panelChat.style.display = 'none';
    });
  }

  // Sohbet Gönder
  const btnSendChat = document.getElementById('btn-send-chat');
  const inpChat = document.getElementById('chat-inp');
  if (btnSendChat && inpChat) {
    const sendMsg = () => {
      const text = inpChat.value.trim();
      if (text) {
        socket.emit('okey101:chat_message', { text });
        inpChat.value = '';
        
        // Ekrana da ekleyelim şimdilik local olarak (sunucudan gelecek aslında)
        const chatBody = document.getElementById('chat-body');
        const msgEl = document.createElement('div');
        msgEl.className = 'chat-msg';
        msgEl.innerHTML = `<b>Sen:</b> ${text}`;
        chatBody.appendChild(msgEl);
        chatBody.scrollTop = chatBody.scrollHeight;
      }
    };
    btnSendChat.addEventListener('click', sendMsg);
    inpChat.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMsg();
    });
  }

})();
