(() => {
  console.log('[LOOTIV] okey101.js v1 yuklendi');

  const socket = io({ query: { game: 'okey101' } });

  const playerList = document.getElementById('player-list');
  const playerCount = document.getElementById('player-count');
  const chatMessages = document.getElementById('chat-messages');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const tabs = Array.from(document.querySelectorAll('.chat-tab'));

  const messagesByChannel = { genel: [], okey101: [], sistem: [] };
  let activeChannel = 'genel';

  function formatTime(isoLike) {
    const d = new Date(isoLike.replace(' ', 'T') + 'Z');
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function renderMessages() {
    const list = messagesByChannel[activeChannel] || [];
    chatMessages.innerHTML = list
      .map((m) => {
        const isSystem = m.channel === 'sistem';
        return `
          <div class="chat-message ${isSystem ? 'chat-message-system' : ''}">
            ${isSystem ? '' : `<span class="chat-message-author">${escapeHtml(m.username)}</span>`}
            <span class="chat-message-text">${escapeHtml(m.content)}</span>
            <span class="chat-message-time">${formatTime(m.created_at)}</span>
          </div>
        `;
      })
      .join('');
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      activeChannel = tab.dataset.channel;
      chatMessages.dataset.channel = activeChannel;

      const isSystem = activeChannel === 'sistem';
      chatInput.disabled = isSystem;
      chatInput.placeholder = isSystem ? 'Sistem mesajlari salt okunurdur' : 'Mesajini yaz...';
      chatForm.querySelector('button').disabled = isSystem;

      renderMessages();
    });
  });

  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text || activeChannel === 'sistem') return;
    socket.emit('chat:message', { channel: activeChannel, text });
    chatInput.value = '';
  });

  socket.on('chat:history', (history) => {
    for (const ch of Object.keys(history)) {
      if (messagesByChannel[ch] !== undefined) messagesByChannel[ch] = history[ch] || [];
    }
    renderMessages();
  });

  socket.on('chat:message', (msg) => {
    if (messagesByChannel[msg.channel] === undefined) return;
    messagesByChannel[msg.channel].push(msg);
    if (msg.channel === activeChannel) renderMessages();
  });

  socket.on('poker:players', (players) => {
    playerCount.textContent = String(players.length);
    playerList.innerHTML = players
      .map((name) => `<li class="player-item"><span class="player-dot"></span>${escapeHtml(name)}</li>`)
      .join('');
  });

  // ==================== 101 OKEY MASASI ====================
  const CURRENT_USER_ID = Number(document.body.dataset.userId);
  const RACK_COLS = 13;
  const RACK_ROWS = 2;
  const RACK_SLOTS = RACK_COLS * RACK_ROWS;

  const seatsEl = document.getElementById('okey-seats');
  const statusEl = document.getElementById('okey-status');
  const indicatorEl = document.getElementById('okey-indicator');
  const deckPileEl = document.getElementById('okey-deck-pile');
  const deckCountEl = document.getElementById('okey-deck-count');
  const cornerEls = [0, 1, 2, 3].map((i) => document.getElementById('okey-corner-' + i));
  const boardEl = document.getElementById('okey101-board');
  const bannerEl = document.getElementById('okey-banner');
  const rackEl = document.getElementById('okey-rack');
  const actionBarEl = document.getElementById('okey-action-bar');
  const ciftDizBtn = document.getElementById('okey-cift-diz');
  const seriDizBtn = document.getElementById('okey-seri-diz');

  let rackLayout = new Array(RACK_SLOTS).fill(null);
  let serverTiles = [];
  let lastState = null;
  let countdownInterval = null;
  let toastTimer = null;

  function showToast(msg) {
    let toast = document.getElementById('okey-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'okey-toast';
      toast.className = 'table-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 3500);
  }

  function isOkeyTile(tile, okeySpec) {
    if (!okeySpec) return false;
    return tile.joker || (tile.color === okeySpec.color && tile.number === okeySpec.number);
  }

  // ---- Istaka senkronu ----
  function syncRackLayout(tiles) {
    const currentIds = new Set(tiles.map((t) => t.id));
    const placedIds = new Set();

    for (let i = 0; i < rackLayout.length; i++) {
      const cell = rackLayout[i];
      if (cell && !currentIds.has(cell.id)) rackLayout[i] = null;
    }
    for (let i = 0; i < rackLayout.length; i++) {
      const cell = rackLayout[i];
      if (cell) {
        const fresh = tiles.find((t) => t.id === cell.id);
        if (fresh) {
          rackLayout[i] = fresh;
          placedIds.add(fresh.id);
        }
      }
    }
    const newTiles = tiles.filter((t) => !placedIds.has(t.id));

    const layoutEmpty = rackLayout.every((c) => c === null);
    if (layoutEmpty && newTiles.length >= 20) {
      const colorOrder = { kirmizi: 0, sari: 1, mavi: 2, siyah: 3 };
      const sorted = newTiles.slice().sort((a, b) => {
        if (a.joker !== b.joker) return a.joker ? 1 : -1;
        if (a.color !== b.color) return (colorOrder[a.color] ?? 9) - (colorOrder[b.color] ?? 9);
        return a.number - b.number;
      });
      let slot = 0;
      for (const t of sorted) {
        while (slot < RACK_SLOTS && rackLayout[slot] !== null) slot++;
        if (slot >= RACK_SLOTS) break;
        rackLayout[slot] = t;
        slot++;
      }
    } else {
      for (const t of newTiles) {
        let slot = 0;
        while (slot < RACK_SLOTS && rackLayout[slot] !== null) slot++;
        if (slot >= RACK_SLOTS) break;
        rackLayout[slot] = t;
      }
    }
  }

  function tileInnerHtml(tile) {
    if (tile.joker) return `<span class="okey-tile-num">★</span>`;
    return `<span class="okey-tile-num">${tile.number}</span><span class="okey-tile-dot"></span>`;
  }

  function tileClass(tile, okeySpec) {
    let cls = 'okey-tile';
    if (tile.joker) cls += ' okey-tile-joker';
    else cls += ' okey-tile-' + tile.color;
    if (isOkeyTile(tile, okeySpec)) cls += ' okey-tile-wild';
    return cls;
  }

  // ---- Istaka cizimi ----
  function renderRack(state) {
    const okeySpec = state ? state.okeySpec : null;

    rackEl.innerHTML = '';
    for (let row = 0; row < RACK_ROWS; row++) {
      const rowEl = document.createElement('div');
      rowEl.className = 'okey-rack-row';
      for (let col = 0; col < RACK_COLS; col++) {
        const slotIndex = row * RACK_COLS + col;
        const slotEl = document.createElement('div');
        slotEl.className = 'okey-slot';
        slotEl.dataset.slot = String(slotIndex);

        const tile = rackLayout[slotIndex];
        if (tile) {
          const tileEl = document.createElement('div');
          tileEl.className = tileClass(tile, okeySpec);
          tileEl.dataset.tileId = tile.id;
          tileEl.dataset.slot = String(slotIndex);
          tileEl.draggable = true;
          tileEl.innerHTML = tileInnerHtml(tile);
          slotEl.appendChild(tileEl);
        }
        rowEl.appendChild(slotEl);
      }
      rackEl.appendChild(rowEl);
    }

    attachRackDnD();
  }

  // ---- Surukle-birak ----
  let dragTileId = null;
  let dragFromSlot = null;

  function attachRackDnD() {
    const tiles = rackEl.querySelectorAll('.okey-tile');
    const slots = rackEl.querySelectorAll('.okey-slot');

    tiles.forEach((el) => {
      el.addEventListener('dragstart', (e) => {
        dragTileId = el.dataset.tileId;
        dragFromSlot = Number(el.dataset.slot);
        el.classList.add('okey-tile-dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', dragTileId); } catch (err) {}
      });
      el.addEventListener('dragend', () => {
        el.classList.remove('okey-tile-dragging');
        document.querySelectorAll('.okey-slot-over').forEach((s) => s.classList.remove('okey-slot-over'));
        dragTileId = null;
        dragFromSlot = null;
      });
    });

    slots.forEach((slotEl) => {
      slotEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        slotEl.classList.add('okey-slot-over');
      });
      slotEl.addEventListener('dragleave', () => slotEl.classList.remove('okey-slot-over'));
      slotEl.addEventListener('drop', (e) => {
        e.preventDefault();
        slotEl.classList.remove('okey-slot-over');
        const targetSlot = Number(slotEl.dataset.slot);
        if (dragFromSlot === null || Number.isNaN(targetSlot)) return;
        moveTile(dragFromSlot, targetSlot);
      });
    });
  }

  function moveTile(fromSlot, toSlot) {
    if (fromSlot === toSlot) return;
    const moving = rackLayout[fromSlot];
    if (!moving) return;
    const target = rackLayout[toSlot];
    rackLayout[toSlot] = moving;
    rackLayout[fromSlot] = target;
    renderRack(lastState);
  }

  // ---- Dizme algoritmalari (canak okey ile ayni) ----
  const COLOR_ORDER = { kirmizi: 0, sari: 1, mavi: 2, siyah: 3 };

  function isWild(t, okeySpec) {
    return t.joker || (okeySpec && t.color === okeySpec.color && t.number === okeySpec.number);
  }

  function applyGroupsToRack(groups) {
    function layout(useGaps, useRowShift) {
      const arr = new Array(RACK_SLOTS).fill(null);
      let slot = 0;
      let overflow = false;
      groups.forEach((group, gi) => {
        if (group.length === 0) return;
        if (useRowShift && group.length <= RACK_COLS) {
          const col = slot % RACK_COLS;
          if (col + group.length > RACK_COLS) {
            slot = (Math.floor(slot / RACK_COLS) + 1) * RACK_COLS;
          }
        }
        for (const t of group) {
          if (slot >= RACK_SLOTS) { overflow = true; return; }
          arr[slot++] = t;
        }
        if (useGaps && gi < groups.length - 1 && slot < RACK_SLOTS && slot % RACK_COLS !== 0) {
          slot++;
        }
      });
      return { arr, overflow };
    }

    let result = layout(true, true);
    if (result.overflow) result = layout(true, false);
    if (result.overflow) result = layout(false, false);
    rackLayout = result.arr;
    renderRack(lastState);
  }

  function seriDiz(okeySpec) {
    const tiles = rackLayout.filter(Boolean);
    const wilds = tiles.filter((t) => isWild(t, okeySpec));
    let pool = tiles.filter((t) => !isWild(t, okeySpec));
    const groups = [];
    const COLORS = ['kirmizi', 'sari', 'mavi', 'siyah'];

    function takeOne(color, number) {
      const i = pool.findIndex((t) => t.color === color && t.number === number);
      return i === -1 ? null : pool.splice(i, 1)[0];
    }
    function hasTile(color, number) {
      return pool.some((t) => t.color === color && t.number === number);
    }

    for (const color of COLORS) {
      let again = true;
      while (again) {
        again = false;
        const nums = new Set(pool.filter((t) => t.color === color).map((t) => t.number));
        let bestS = 0, bestLen = 0;
        for (let s = 1; s <= 13; s++) {
          if (!nums.has(s) || nums.has(s - 1)) continue;
          let e = s;
          while (nums.has(e + 1)) e++;
          if (e - s + 1 > bestLen) { bestLen = e - s + 1; bestS = s; }
        }
        if (bestLen >= 3) {
          const g = [];
          for (let n = bestS; n < bestS + bestLen; n++) g.push(takeOne(color, n));
          groups.push(g);
          again = true;
        }
      }
    }

    for (let n = 1; n <= 13; n++) {
      let again = true;
      while (again) {
        again = false;
        const avail = COLORS.filter((c) => hasTile(c, n));
        if (avail.length >= 3) {
          groups.push(avail.map((c) => takeOne(c, n)));
          again = true;
        }
      }
    }

    for (const color of COLORS) {
      let again = true;
      while (again) {
        again = false;
        const nums = [...new Set(pool.filter((t) => t.color === color).map((t) => t.number))].sort((a, b) => a - b);
        for (let i = 0; i < nums.length - 1; i++) {
          if (nums[i + 1] === nums[i] + 1) {
            groups.push([takeOne(color, nums[i]), takeOne(color, nums[i] + 1)]);
            again = true;
            break;
          }
        }
      }
    }

    for (let n = 1; n <= 13; n++) {
      let again = true;
      while (again) {
        again = false;
        const avail = COLORS.filter((c) => hasTile(c, n));
        if (avail.length >= 2) {
          groups.push([takeOne(avail[0], n), takeOne(avail[1], n)]);
          again = true;
        }
      }
    }

    if (pool.length) {
      pool.sort((a, b) => {
        if (a.color !== b.color) return (COLOR_ORDER[a.color] ?? 9) - (COLOR_ORDER[b.color] ?? 9);
        return a.number - b.number;
      });
      groups.push(pool.slice());
      pool = [];
    }

    for (const g of groups) {
      if (!wilds.length) break;
      if (g.length === 2) g.push(wilds.shift());
    }

    if (wilds.length) groups.push(wilds);
    applyGroupsToRack(groups);
  }

  function ciftDiz(okeySpec) {
    const tiles = rackLayout.filter(Boolean);
    const wilds = tiles.filter((t) => isWild(t, okeySpec));
    const normals = tiles.filter((t) => !isWild(t, okeySpec));

    const byKey = new Map();
    for (const t of normals) {
      const k = t.color + '|' + t.number;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(t);
    }

    const pairGroups = [];
    const singles = [];
    const sortedKeys = [...byKey.keys()].sort((a, b) => {
      const [ca, na] = a.split('|');
      const [cb, nb] = b.split('|');
      if (ca !== cb) return (COLOR_ORDER[ca] ?? 9) - (COLOR_ORDER[cb] ?? 9);
      return Number(na) - Number(nb);
    });
    for (const k of sortedKeys) {
      const arr = byKey.get(k);
      while (arr.length >= 2) pairGroups.push([arr.shift(), arr.shift()]);
      if (arr.length) singles.push(arr.shift());
    }

    while (wilds.length && singles.length) {
      pairGroups.push([singles.shift(), wilds.shift()]);
    }

    const groups = [...pairGroups];
    if (singles.length) groups.push(singles);
    if (wilds.length) groups.push(wilds);
    applyGroupsToRack(groups);
  }

  // Istakadaki bosluklarla ayrilmis gruplari cikar (acilis icin)
  function extractRackGroups(minLen) {
    const groups = [];
    let current = [];
    for (let i = 0; i < RACK_SLOTS; i++) {
      const t = rackLayout[i];
      const rowEnd = i % RACK_COLS === RACK_COLS - 1;
      if (t) current.push(t.id);
      if (!t || rowEnd) {
        if (current.length >= minLen) groups.push(current);
        current = [];
      }
    }
    if (current.length >= minLen) groups.push(current);
    return groups;
  }

  // ---- Koltuklar ----
  function renderSeats(state) {
    seatsEl.innerHTML = state.seats
      .map((seat, i) => {
        if (!seat) {
          const iAmSeated = state.seats.some((s) => s && s.userId === CURRENT_USER_ID);
          const canSit = !iAmSeated;
          const canBot = state.stage === 'waiting';
          return `
            <div class="okey-seat okey-seat-pos-${i} okey-seat-empty">
              ${canSit ? `<button type="button" class="seat-sit-btn" data-seat="${i}">Otur</button>` : ''}
              ${canBot ? `<button type="button" class="seat-bot-btn" data-botseat="${i}">+ Bot</button>` : ''}
              ${!canSit && !canBot ? '<div class="seat-empty-label">Bos</div>' : ''}
            </div>
          `;
        }
        const isMe = seat.userId === CURRENT_USER_ID;
        const initial = (seat.name || '?').charAt(0).toUpperCase();
        return `
          <div class="okey-seat okey-seat-pos-${i} ${seat.isTurn ? 'okey-seat-turn' : ''}">
            ${seat.isDealer ? '<div class="seat-dealer-badge">D</div>' : ''}
            <div class="okey-seat-avatar ${seat.isBot ? 'okey-seat-avatar-bot' : ''} ${seat.isTurn ? 'okey-seat-avatar-turn' : ''}">
              <span>${escapeHtml(initial)}</span>
              ${seat.isBot ? '<span class="okey-bot-tag">BOT</span>' : ''}
            </div>
            <div class="seat-info ${isMe ? 'seat-info-me' : ''}">
              <div class="seat-name">${escapeHtml(seat.name)}${seat.leavingAfterHand ? ' <span class="seat-leaving">(ayriliyor)</span>' : ''}</div>
              <div class="okey-seat-tilecount">${seat.tileCount} tas${seat.hasOpened ? ' &middot; <span class="okey-opened-tag">ACTI</span>' : ''}</div>
              ${isMe ? '<button type="button" class="seat-stand-btn" id="stand-btn">Kalk</button>' : ''}
            </div>
          </div>
        `;
      })
      .join('');

    seatsEl.querySelectorAll('.seat-sit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        socket.emit('okey101:sit', { seatIndex: Number(btn.dataset.seat) });
      });
    });
    seatsEl.querySelectorAll('.seat-bot-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        socket.emit('okey101:addbot', { seatIndex: Number(btn.dataset.botseat) });
      });
    });
    const standBtn = document.getElementById('stand-btn');
    if (standBtn) standBtn.addEventListener('click', () => socket.emit('okey101:stand'));
  }

  function miniTileHtml(tile, okeySpec) {
    if (!tile) return '';
    let cls = 'okey-tile okey-tile-mini';
    if (tile.joker) cls += ' okey-tile-joker';
    else cls += ' okey-tile-' + tile.color;
    if (isOkeyTile(tile, okeySpec)) cls += ' okey-tile-wild';
    return `<div class="${cls}">${tile.joker ? '★' : tile.number}</div>`;
  }

  function renderIndicator(state) {
    if (!state.indicator) {
      indicatorEl.innerHTML = '';
      return;
    }
    indicatorEl.innerHTML = miniTileHtml(state.indicator, null);
  }

  // ---- Acilan perler panosu (isleme drop hedefi) ----
  function renderBoard(state) {
    const melds = state.boardMelds || [];
    if (!melds.length) {
      boardEl.innerHTML = '';
      boardEl.classList.remove('okey101-board-active');
      return;
    }
    boardEl.classList.add('okey101-board-active');

    const myIndex = state.seats.findIndex((s) => s && s.userId === CURRENT_USER_ID);
    const mySeat = myIndex !== -1 ? state.seats[myIndex] : null;
    const canProcess =
      mySeat && mySeat.hasOpened && state.turnSeat === myIndex && state.hasDrawn && state.stage === 'playing';

    boardEl.innerHTML = melds
      .map((m) => {
        const owner = state.seats[m.ownerSeat] ? escapeHtml(state.seats[m.ownerSeat].name) : '';
        const droppable = canProcess && m.kind !== 'cift';
        return `
          <div class="board-meld ${droppable ? 'board-meld-droppable' : ''}" data-meld-id="${m.id}">
            <div class="board-meld-tiles">${m.tiles.map((t) => miniTileHtml(t, state.okeySpec)).join('')}</div>
            <div class="board-meld-owner">${owner}</div>
          </div>
        `;
      })
      .join('');

    boardEl.querySelectorAll('.board-meld-droppable').forEach((el) => {
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        el.classList.add('okey-slot-over');
      });
      el.addEventListener('dragleave', () => el.classList.remove('okey-slot-over'));
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('okey-slot-over');
        if (dragTileId) {
          socket.emit('okey101:process', { tileId: dragTileId, meldId: Number(el.dataset.meldId) });
        }
      });
    });
  }

  // ---- Deste + kose iskartalari ----
  function renderDeckAndCorners(state) {
    deckCountEl.textContent = `${state.deckCount} tas`;

    const myIndex = state.seats.findIndex((s) => s && s.userId === CURRENT_USER_ID);
    const mySeat = myIndex !== -1 ? state.seats[myIndex] : null;
    const myTurn = myIndex !== -1 && state.turnSeat === myIndex && state.stage === 'playing';
    const canDrawDeck = myTurn && !state.hasDrawn && state.deckCount > 0;
    deckPileEl.classList.toggle('okey-drawable', canDrawDeck);
    deckPileEl.onclick = canDrawDeck ? () => socket.emit('okey101:draw', { source: 'deck' }) : null;

    const piles = state.discardPiles || [];
    for (let i = 0; i < cornerEls.length; i++) {
      const el = cornerEls[i];
      if (!el) continue;
      const pile = piles[i] || { count: 0, top: null };

      const canTake =
        myTurn &&
        !state.hasDrawn &&
        mySeat &&
        mySeat.hasOpened && // 101 kurali: acmadan yerden tas alinamaz
        state.lastDiscard &&
        state.lastDiscard.availableToSeat === myIndex &&
        state.lastDiscard.fromSeat === i;

      const canDrop = myTurn && state.hasDrawn && i === myIndex;

      if (pile.top) {
        el.innerHTML =
          miniTileHtml(pile.top, state.okeySpec) +
          (pile.count > 1 ? `<span class="okey-corner-count">${pile.count}</span>` : '');
      } else {
        el.innerHTML = canDrop ? '<div class="okey-corner-hint">Tasi buraya birak</div>' : '';
      }

      el.classList.toggle('okey-drawable', canTake);
      el.classList.toggle('okey-corner-droppable', canDrop);
      el.onclick = canTake ? () => socket.emit('okey101:draw', { source: 'discard' }) : null;

      el.ondragover = canDrop
        ? (e) => { e.preventDefault(); el.classList.add('okey-slot-over'); }
        : null;
      el.ondragleave = canDrop ? () => el.classList.remove('okey-slot-over') : null;
      el.ondrop = canDrop
        ? (e) => {
            e.preventDefault();
            el.classList.remove('okey-slot-over');
            if (dragTileId) socket.emit('okey101:discard', { tileId: dragTileId });
          }
        : null;
    }
  }

  function renderStatus(state) {
    clearInterval(countdownInterval);
    if (state.stage === 'waiting') {
      if (state.nextHandAt) {
        const tick = () => {
          const remain = Math.max(0, Math.ceil((state.nextHandAt - Date.now()) / 1000));
          statusEl.textContent = `Yeni el ${remain} saniye icinde basliyor...`;
          if (remain <= 0) clearInterval(countdownInterval);
        };
        tick();
        countdownInterval = setInterval(tick, 500);
      } else {
        statusEl.textContent = 'Bir koltuga otur; bos koltuklari botla doldurup hemen baslayabilirsin.';
      }
    } else if (state.stage === 'playing') {
      const tick = () => {
        if (!state.turnDeadline) {
          statusEl.textContent = `El #${state.handNumber}`;
          return;
        }
        const remain = Math.max(0, Math.ceil((state.turnDeadline - Date.now()) / 1000));
        const turnName = state.seats[state.turnSeat] ? state.seats[state.turnSeat].name : '';
        statusEl.textContent = `El #${state.handNumber} — Sira: ${turnName} (${remain}s)`;
      };
      tick();
      countdownInterval = setInterval(tick, 500);
    } else {
      statusEl.textContent = `El #${state.handNumber} bitti.`;
    }
  }

  function renderBanner(state) {
    if (state.stage === 'finished' && state.lastHandSummary) {
      const s = state.lastHandSummary;
      const rows = (s.results || [])
        .slice()
        .sort((a, b) => a.penalty - b.penalty)
        .map(
          (r) =>
            `${escapeHtml(r.name)}: ${r.opened ? 'ceza ' + r.penalty : 'acmadi'} (${r.ltChange >= 0 ? '+' : ''}${r.ltChange} LT)`
        )
        .join('<br/>');
      bannerEl.innerHTML = `<div class="banner-inner">${escapeHtml(s.reason || 'El bitti')}${s.note ? '<br/>' + escapeHtml(s.note) : ''}<br/><br/>${rows}</div>`;
      bannerEl.classList.add('visible');
    } else {
      bannerEl.classList.remove('visible');
      bannerEl.innerHTML = '';
    }
  }

  function renderActionBar(state) {
    const myIndex = state ? state.seats.findIndex((s) => s && s.userId === CURRENT_USER_ID) : -1;
    const mySeat = myIndex !== -1 && state ? state.seats[myIndex] : null;
    const parts = [];

    if (state && state.stage === 'waiting') {
      const emptyCount = state.seats.filter((s) => !s).length;
      const botCount = state.seats.filter((s) => s && s.isBot).length;
      if (myIndex !== -1 && emptyCount > 0) {
        parts.push(`<button type="button" class="btn btn-primary btn-sm" id="okey-fillbots-btn">Bos Koltuklari Botla Doldur & Basla</button>`);
      }
      if (botCount > 0) {
        parts.push(`<button type="button" class="btn btn-ghost btn-sm" id="okey-removebots-btn">Botlari Cikar</button>`);
      }
    }

    if (myIndex !== -1 && state && state.turnSeat === myIndex && state.stage === 'playing') {
      if (!state.hasDrawn) {
        const takeHint = mySeat && mySeat.hasOpened
          ? 'desteden veya sol kosedeki atilan tastan cek.'
          : 'desteden cek (yerden almak icin once elini acmalisin).';
        parts.push(`<div class="okey-hint">Ortadaki ${takeHint}</div>`);
      } else {
        if (mySeat && !mySeat.hasOpened) {
          parts.push(`<div class="okey-hint">Gruplarini bosluklarla ayirip ac; ya da tasini sag kosene surukleyip at.</div>`);
          parts.push(`<button type="button" class="action-btn action-raise" id="okey101-open-seri-btn">Seri Ac (${state.openMin}+)</button>`);
          parts.push(`<button type="button" class="action-btn action-call" id="okey101-open-cift-btn">Cift Ac (${state.ciftMin}+ cift)</button>`);
        } else {
          parts.push(`<div class="okey-hint">Tas islemek icin tasi yerdeki bir gruba surukle; bitirmek icin son tasini sag kosene at.</div>`);
        }
      }
    }

    actionBarEl.innerHTML = parts.join('');

    document.getElementById('okey-fillbots-btn')?.addEventListener('click', () => {
      socket.emit('okey101:fillbots');
    });
    document.getElementById('okey-removebots-btn')?.addEventListener('click', () => {
      socket.emit('okey101:removebots');
    });
    document.getElementById('okey101-open-seri-btn')?.addEventListener('click', () => {
      const groups = extractRackGroups(3);
      if (!groups.length) {
        showToast('Once acmak istedigin serileri/perleri istakada bosluklarla ayirarak grupla (Seri Diz yardimci olur).');
        return;
      }
      socket.emit('okey101:open', { kind: 'seri', groups });
    });
    document.getElementById('okey101-open-cift-btn')?.addEventListener('click', () => {
      const groups = extractRackGroups(2).filter((g) => g.length === 2);
      if (!groups.length) {
        showToast('Once ciftlerini istakada ikiser ikiser, aralarinda bosluk birakarak diz (Cift Diz yardimci olur).');
        return;
      }
      socket.emit('okey101:open', { kind: 'cift', groups });
    });

    const hasTiles = rackLayout.some(Boolean);
    if (ciftDizBtn) ciftDizBtn.disabled = !hasTiles;
    if (seriDizBtn) seriDizBtn.disabled = !hasTiles;
  }

  if (ciftDizBtn) ciftDizBtn.addEventListener('click', () => ciftDiz(lastState ? lastState.okeySpec : null));
  if (seriDizBtn) seriDizBtn.addEventListener('click', () => seriDiz(lastState ? lastState.okeySpec : null));

  socket.on('okey101:state', (state) => {
    lastState = state;
    const myIndex = state.seats.findIndex((s) => s && s.userId === CURRENT_USER_ID);
    if (myIndex === -1 || state.stage === 'waiting') {
      rackLayout = new Array(RACK_SLOTS).fill(null);
      serverTiles = [];
    }
    renderSeats(state);
    renderIndicator(state);
    renderBoard(state);
    renderDeckAndCorners(state);
    renderStatus(state);
    renderBanner(state);
    renderRack(state);
    renderActionBar(state);
  });

  socket.on('okey101:tiles', (tiles) => {
    serverTiles = tiles;
    syncRackLayout(tiles);
    renderRack(lastState);
    renderActionBar(lastState);
  });

  socket.on('okey101:error', (msg) => showToast(msg));
})();
