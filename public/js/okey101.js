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
  let rackSlots = new Array(34).fill(null); // 2 rows of 17
  let selectedTiles = new Set();
  let dragTileId = null;
  let currentOkeySpec = null;

  // ---------------- RENDER HELPERS ----------------
  function getTileHtml(tile, isMini = false) {
    if (!tile) return '';
    let cls = isMini ? 'tile mini' : 'tile'; 
    if (selectedTiles.has(tile.id) && !isMini) cls += ' selected';
    
    if (tile.color === 'red' || tile.color === 'kirmizi') cls += ' red';
    if (tile.color === 'black' || tile.color === 'siyah') cls += ' black';
    if (tile.color === 'blue' || tile.color === 'mavi') cls += ' blue';
    if (tile.color === 'orange' || tile.color === 'sari') cls += ' orange';

    let isRealOkey = false;
    if (currentOkeySpec && !tile.joker && tile.color === currentOkeySpec.color && tile.number === currentOkeySpec.number) {
        isRealOkey = true;
        cls += ' okey-tile';
    }

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
        el.name.innerHTML = `<span class="btn-add-bot" data-seat="${actualIndex}">[+] Bot Ekle</span>`;
        el.avatar.innerHTML = '--';
        el.score.textContent = '0';
        el.discard.innerHTML = '';
        el.avatar.style.border = "";
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
    
    for (let i = 0; i < 34; i++) {
        const slotEl = document.createElement('div');
        slotEl.className = 'rack-slot';
        slotEl.dataset.index = i;
        
        slotEl.ondragover = (e) => { e.preventDefault(); slotEl.classList.add('drag-over'); };
        slotEl.ondragleave = () => slotEl.classList.remove('drag-over');
        slotEl.ondrop = (e) => {
            e.preventDefault();
            slotEl.classList.remove('drag-over');
            if (dragTileId) {
                const srcIdx = rackSlots.findIndex(t => t && t.id === dragTileId);
                const targetIdx = i;
                if (srcIdx !== -1 && srcIdx !== targetIdx) {
                    // Swap tiles
                    const temp = rackSlots[targetIdx];
                    rackSlots[targetIdx] = rackSlots[srcIdx];
                    rackSlots[srcIdx] = temp;
                    renderRack();
                }
            }
        };

        const tile = rackSlots[i];
        if (tile) {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = getTileHtml(tile, false);
            const tileEl = wrapper.firstElementChild;
            
            tileEl.draggable = true;
            tileEl.ondragstart = (e) => {
                dragTileId = tile.id;
                setTimeout(() => tileEl.classList.add('dragging'), 0);
                e.dataTransfer.setData('text/plain', tile.id);
            };
            tileEl.ondragend = () => {
                dragTileId = null;
                tileEl.classList.remove('dragging');
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
        
        if (i < 17) {
            rackRow1.appendChild(slotEl);
        } else {
            rackRow2.appendChild(slotEl);
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
      const maxGaps = 34 - tilesCount;
      
      // Merge groups if we exceed available gaps
      while (groups.length - 1 > maxGaps && groups.length > 1) {
          const last = groups.pop();
          groups[groups.length - 1].push(...last);
      }
      
      rackSlots.fill(null);
      let currentIdx = 0;
      
      for (let i = 0; i < groups.length; i++) {
          const group = groups[i];
          
          if (currentIdx < 17) {
              const tilesRemaining = groups.slice(i).reduce((acc, g) => acc + g.length, 0);
              const groupsRemaining = groups.length - i;
              const slotsNeeded = tilesRemaining + groupsRemaining - 1;
              
              // Wrap to bottom row if group overflows top, or if we are midway and bottom has room
              if (currentIdx + group.length > 17 || (currentIdx >= 7 && slotsNeeded <= 17)) {
                  currentIdx = 17;
              }
          }
          
          for (const tile of group) {
              if (currentIdx < 34) {
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

  // Sort Buttons
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
  function getSelectedGroups() {
      if (selectedTiles.size === 0) return [];
      
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
