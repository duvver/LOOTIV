(() => {
  // Surum takibi: F12 > Console'da bu satiri gormuyorsan tarayici ESKI dosyayi kullaniyor demektir.

  const roomId = new URLSearchParams(window.location.search).get('roomId');
  const socket = io({ query: { game: 'okey', roomId: roomId || '' } });

  const playerList = document.getElementById('player-list');
  const playerCount = document.getElementById('player-count');
  const chatMessages = document.getElementById('chat-messages');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const tabs = Array.from(document.querySelectorAll('.chat-tab'));

  const messagesByChannel = { oyun: [], sistem: [], masa: [] };
  let activeChannel = 'oyun';

  function formatTime(isoLike) {
    const d = new Date(isoLike.replace(' ', 'T') + 'Z');
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#039;');
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
      tab.classList.remove('has-new');
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
    if (activeChannel === 'masa') {
      socket.emit('okey:chat_message', { text });
    } else {
      socket.emit('chat:message', { channel: activeChannel, text });
    }
    chatInput.value = '';
  });

  socket.on('chat:history', (history) => {
    // Sunucudan genel, okey, vs. gelirse onu oyun kanalına yönlendirelim
    const histOyun = [...(history.genel || []), ...(history.okey || []), ...(history.oyun || [])]
      .sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
    messagesByChannel['oyun'] = histOyun;
    if (history.sistem) messagesByChannel['sistem'] = history.sistem;
    
    renderMessages();
  });

  socket.on('chat:message', (msg) => {
    const ch = msg.channel === 'sistem' ? 'sistem' : 'oyun';
    messagesByChannel[ch].push(msg);
    if (messagesByChannel[ch].length > 200) messagesByChannel[ch].shift();
    
    if (ch === activeChannel) {
      renderMessages();
    } else {
      const tab = tabs.find((t) => t.dataset.channel === ch);
      if (tab) tab.classList.add('has-new');
    }
  });

  socket.on('okey:chat', (msg) => {
    if (!messagesByChannel['masa']) messagesByChannel['masa'] = [];
    messagesByChannel['masa'].push({
      channel: 'masa',
      username: msg.name,
      content: msg.text,
      created_at: new Date(msg.timestamp).toISOString().replace('T', ' ').substring(0, 19)
    });
    if (messagesByChannel['masa'].length > 200) messagesByChannel['masa'].shift();
    if (activeChannel === 'masa') {
      renderMessages();
    } else {
      const tab = tabs.find((t) => t.dataset.channel === 'masa');
      if (tab) tab.classList.add('has-new');
    }
  });

  socket.on('room:spectators', (count) => {
    const elCount = document.getElementById('spectator-count-val');
    const elBadge = document.getElementById('spectator-count');
    if (elCount && elBadge) {
      elCount.textContent = count;
      elBadge.style.display = count > 0 ? 'inline-flex' : 'none';
    }
  });

  socket.on('poker:players', (players) => {
    playerCount.textContent = String(players.length);
    playerList.innerHTML = players
      .map((name) => `<li class="player-item"><span class="player-dot"></span>${escapeHtml(name)}</li>`)
      .join('');
  });

  // ==================== OKEY MASASI ====================
  const CURRENT_USER_ID = Number(document.body.dataset.userId);
  const RACK_COLS = 13;
  const RACK_ROWS = 2;
  const RACK_SLOTS = RACK_COLS * RACK_ROWS; // 26 slot

  const seatsEl = document.getElementById('okey-seats');
  const statusEl = document.getElementById('okey-status');
  const indicatorEl = document.getElementById('okey-indicator');
  const deckPileEl = document.getElementById('okey-deck-pile');
  const deckCountEl = document.getElementById('okey-deck-count');
  const cornerEls = [0, 1, 2, 3].map((i) => document.getElementById('okey-corner-' + i));
  const bannerEl = document.getElementById('okey-banner');
  const rackEl = document.getElementById('okey-rack');
  const actionBarEl = document.getElementById('okey-action-bar');
  const ciftDizBtn = document.getElementById('okey-cift-diz');
  const seriDizBtn = document.getElementById('okey-seri-diz');

  // rackLayout: 26 uzunlukta dizi; her hucre ya null ya da bir tile objesi.
  // Kullanicinin elle dizdigi duzeni burada tutuyoruz; sunucu sadece hangi
  // taslara sahip oldugumuzu bilir, dizilim tamamen istemcide.
  let rackLayout = new Array(RACK_SLOTS).fill(null);
  let serverTiles = []; // sunucudan gelen guncel tas listesi
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
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 3000);
  }

  function isOkeyTile(tile, okeySpec) {
    if (!okeySpec) return false;
    return tile.joker || (tile.color === okeySpec.color && tile.number === okeySpec.number);
  }

  // ---- Istaka duzenini sunucudan gelen tas listesiyle senkronla ----
  // Elimizde olan ama layout'ta olmayan taslari ilk bos slota koy;
  // layout'ta olan ama artik elimizde olmayan (atilmis) taslari kaldir.
  function syncRackLayout(tiles, okeySpec) {
    const currentIds = new Set(tiles.map((t) => t.id));
    const placedIds = new Set();

    // 1) Artik elimizde olmayan taslari layout'tan temizle
    for (let i = 0; i < rackLayout.length; i++) {
      const cell = rackLayout[i];
      if (cell && !currentIds.has(cell.id)) {
        rackLayout[i] = null;
      }
    }
    // 2) Layout'ta zaten olan taslarin guncel referansini kullan
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
    // 3) Yeni gelen (layout'ta olmayan) taslari ilk bos slota yerlestir
    const newTiles = tiles.filter((t) => !placedIds.has(t.id));

    // Ilk defa el geliyorsa (layout tamamen bos ve elde 14-15 tas var) otomatik
    // olarak renk/sayiya gore siralayip yerlestir - kullanici sonra istedigi
    // gibi tasiyabilir.
    const layoutEmpty = rackLayout.every((c) => c === null);
    if (layoutEmpty && newTiles.length >= 14) {
      const sorted = newTiles.slice().sort((a, b) => {
        if (a.joker !== b.joker) return a.joker ? 1 : -1;
        const colorOrder = { kirmizi: 0, sari: 1, mavi: 2, siyah: 3 };
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

  function tileInnerHtml(tile, okeySpec) {
    if (tile.joker) {
      // Sahte okey: uzerinde gosterge okeyi degeri gorunur ama "sahte" isareti tasir
      return `<span class="okey-tile-num">★</span>`;
    }
    return `<span class="okey-tile-num">${tile.number}</span><span class="okey-tile-dot"></span>`;
  }

  function tileClass(tile, okeySpec) {
    let cls = 'okey-tile';
    if (tile.joker) cls += ' okey-tile-joker';
    else cls += ' okey-tile-' + tile.color;
    if (isOkeyTile(tile, okeySpec)) cls += ' okey-tile-wild';
    return cls;
  }

  // ---- Istaka cizimi (2 sira, sürükle-bırak) ----
  function renderRack(state) {
    const myIndex = state ? state.seats.findIndex((s) => s && s.userId === CURRENT_USER_ID) : -1;
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
          tileEl.innerHTML = tileInnerHtml(tile, okeySpec);
          slotEl.appendChild(tileEl);
        }
        rowEl.appendChild(slotEl);
      }
      rackEl.appendChild(rowEl);
    }

    attachRackDnD();
  }

  // ---- Sürükle-bırak mantigi ----
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
        rackEl.querySelectorAll('.okey-slot-over').forEach((s) => s.classList.remove('okey-slot-over'));
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
      slotEl.addEventListener('dragleave', () => {
        slotEl.classList.remove('okey-slot-over');
      });
      slotEl.addEventListener('drop', (e) => {
        e.preventDefault();
        slotEl.classList.remove('okey-slot-over');
        const targetSlot = Number(slotEl.dataset.slot);
        if (dragFromSlot === null || Number.isNaN(targetSlot)) return;
        moveTile(dragFromSlot, targetSlot);
      });
    });
  }

  // Bir tasi bir slottan digerine tasi. Hedef doluysa yer degistir (swap).
  function moveTile(fromSlot, toSlot) {
    if (fromSlot === toSlot) return;
    const moving = rackLayout[fromSlot];
    if (!moving) return;
    const target = rackLayout[toSlot];
    rackLayout[toSlot] = moving;
    rackLayout[fromSlot] = target; // target null ise slot bosalir, doluysa swap
    renderRack(lastState);
  }

  // ---- Dizme algoritmalari ----
  const COLOR_ORDER = { kirmizi: 0, sari: 1, mavi: 2, siyah: 3 };

  function isWild(t, okeySpec) {
    return t.joker || (okeySpec && t.color === okeySpec.color && t.number === okeySpec.number);
  }

  // Gruplari istakaya diz: bir grup icindeki taslar BITISIK, gruplar arasi 1 bos
  // slot. Soldan saga, birinci satir dolunca ikinci satira gecer. Bir grup satir
  // sonuna sigmiyorsa bolunmemesi icin alt satira kaydirilir. Bosluklu yerlesim
  // 26 slota sigmazsa bosluksuz sikistirilir (tas asla dusurulmez).
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

  // SERI DIZ: eli okey mantigiyla duzenler.
  // Oncelik: (1) 3+ tam seriler (ayni renk ardisik), (2) 3-4'lu perler (ayni
  // sayi, farkli renkler), (3) 2'li seri adaylari, (4) 2'li per adaylari,
  // (5) kalan tekler, (6) okey/jokerler.
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

    // (1) 3+ tam seriler: her renkte en uzun ardisik zinciri bul, 3+ ise grupla; tekrarla
    for (const color of COLORS) {
      let again = true;
      while (again) {
        again = false;
        const nums = new Set(pool.filter((t) => t.color === color).map((t) => t.number));
        let bestS = 0, bestLen = 0;
        for (let s = 1; s <= 13; s++) {
          if (!nums.has(s) || nums.has(s - 1)) continue; // zincir baslangici
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

    // (2) 3-4'lu perler: ayni sayidan 3+ farkli renk
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

    // (3) 2'li seri adaylari: ayni renk ardisik ikili
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

    // (4) 2'li per adaylari: ayni sayidan 2 farkli renk
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

    // (5) kalan tekler: renk + sayi sirali tek grup
    if (pool.length) {
      pool.sort((a, b) => {
        if (a.color !== b.color) return (COLOR_ORDER[a.color] ?? 9) - (COLOR_ORDER[b.color] ?? 9);
        return a.number - b.number;
      });
      groups.push(pool.slice());
      pool = [];
    }

    // (5.5) Kalan okey/jokerlerle 2'li gruplari 3'e tamamla
    // (orn. 2 gercek 13 + okey tasi = 3'lu grup)
    for (const g of groups) {
      if (!wilds.length) break;
      if (g.length === 2) g.push(wilds.shift());
    }

    // (6) okey/jokerler en sonda
    if (wilds.length) groups.push(wilds);

    applyGroupsToRack(groups);
  }

  // CIFT DIZ: ayni renk + ayni sayidan 2 tane olanlari cift cift diz,
  // tekleri sona koy.
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

    // Okey/joker: tek kalan taslarla eslestir (cift tamamlar), artan varsa sona
    while (wilds.length && singles.length) {
      pairGroups.push([singles.shift(), wilds.shift()]);
    }

    const groups = [...pairGroups];
    if (singles.length) groups.push(singles);
    if (wilds.length) groups.push(wilds);

    applyGroupsToRack(groups);
  }

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
              <div class="seat-emote-bubble" id="emote-bubble-${seat.userId}"></div>
              ${!isMe && !seat.isBot ? `<button type="button" class="seat-gift-btn" data-target-id="${seat.userId}" title="Hediye 100 LT gönder">🎁</button>` : ''}
            </div>
            <div class="seat-info ${isMe ? 'seat-info-me' : ''}">
              <div class="seat-name">${escapeHtml(seat.name)}${seat.leavingAfterHand ? ' <span class="seat-leaving">(ayriliyor)</span>' : ''}</div>
              <div class="okey-seat-tilecount">${seat.tileCount} tas</div>
              ${isMe ? '<button type="button" class="seat-stand-btn" id="stand-btn">Kalk</button>' : ''}
            </div>
          </div>
        `;
      })
      .join('');

    seatsEl.querySelectorAll('.seat-sit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        socket.emit('okey:sit', { seatIndex: Number(btn.dataset.seat) });
      });
    });
    seatsEl.querySelectorAll('.seat-bot-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        socket.emit('okey:addbot', { seatIndex: Number(btn.dataset.botseat) });
      });
    });
    seatsEl.querySelectorAll('.seat-gift-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const targetId = Number(btn.dataset.targetId);
        if (confirm('100 LT hediye etmek istediğinize emin misiniz?')) {
          socket.emit('okey:gift', { targetUserId: targetId });
        }
      });
    });
    const standBtn = document.getElementById('stand-btn');
    if (standBtn) standBtn.addEventListener('click', () => socket.emit('okey:stand'));
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
    // Sadece gosterge tasi gorunur - yazi yok.
    indicatorEl.innerHTML = miniTileHtml(state.indicator, null);
  }

  // Koltuk i'nin attigi taslar, koltuk i ile sonraki oyuncu arasindaki koseye
  // dizilir (okey-corner-i). Sira sende ve cekmemissen, onceki oyuncunun
  // kosesindeki son tas alinabilir; cektiysen KENDI kosene tas surukleyerek atarsin.
  function renderDeckAndCorners(state) {
    deckCountEl.textContent = `${state.deckCount} tas`;

    const myIndex = state.seats.findIndex((s) => s && s.userId === CURRENT_USER_ID);
    const myTurn = myIndex !== -1 && state.turnSeat === myIndex && state.stage === 'playing';
    const canDrawDeck = myTurn && !state.hasDrawn && state.deckCount > 0;
    deckPileEl.classList.toggle('okey-drawable', canDrawDeck);
    deckPileEl.onclick = canDrawDeck ? () => socket.emit('okey:draw', { source: 'deck' }) : null;

    const piles = state.discardPiles || [];
    for (let i = 0; i < cornerEls.length; i++) {
      const el = cornerEls[i];
      if (!el) continue;
      const pile = piles[i] || { count: 0, top: null };

      // Iskartadan alma: son atilan tas benim icin uygunsa ve o tas bu kosede duruyorsa
      const canTake =
        myTurn &&
        !state.hasDrawn &&
        state.lastDiscard &&
        state.lastDiscard.availableToSeat === myIndex &&
        state.lastDiscard.fromSeat === i;

      // Tas atma: sira bende ve cektiysem, KENDI koseme birakirim
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
      el.onclick = canTake ? () => socket.emit('okey:draw', { source: 'discard' }) : null;

      el.ondragover = canDrop
        ? (e) => { e.preventDefault(); el.classList.add('okey-slot-over'); }
        : null;
      el.ondragleave = canDrop ? () => el.classList.remove('okey-slot-over') : null;
      el.ondrop = canDrop
        ? (e) => {
            e.preventDefault();
            el.classList.remove('okey-slot-over');
            if (dragTileId) socket.emit('okey:discard', { tileId: dragTileId });
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
      if (s.winnerName) {
        const tags = [s.eldenBitti ? 'Elden' : null, s.ciftBitti ? 'Cift' : null].filter(Boolean).join(', ');
        bannerEl.innerHTML = `<div class="banner-inner">Kazanan: ${escapeHtml(s.winnerName)} (+${s.amount} LT)${tags ? ` — ${tags}` : ''}</div>`;
      } else {
        bannerEl.innerHTML = `<div class="banner-inner">${escapeHtml(s.reason || 'El berabere bitti.')}</div>`;
      }
      bannerEl.classList.add('visible');
    } else {
      bannerEl.classList.remove('visible');
      bannerEl.innerHTML = '';
    }
  }

  function renderActionBar(state) {
    const myIndex = state ? state.seats.findIndex((s) => s && s.userId === CURRENT_USER_ID) : -1;
    const parts = [];

    // Test yardimcilari: bekleme asamasinda bot doldur / temizle
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
        parts.push(`<div class="okey-hint">Ortadaki desteden veya sol kosende atilan tastan cek.</div>`);
      } else {
        parts.push(`<div class="okey-hint">Atacagin tasi sag kosene (isikli alan) surukle. Elin bittiyse Bitir.</div>`);
        parts.push(`<button type="button" class="action-btn action-raise" id="okey-finish-btn">Bitir</button>`);
      }
    }

    actionBarEl.innerHTML = parts.join('');

    document.getElementById('okey-fillbots-btn')?.addEventListener('click', () => {
      socket.emit('okey:fillbots');
    });
    document.getElementById('okey-removebots-btn')?.addEventListener('click', () => {
      socket.emit('okey:removebots');
    });
    document.getElementById('okey-finish-btn')?.addEventListener('click', () => {
      socket.emit('okey:finish');
    });

    // Cift Diz / Seri Diz butonlari: elimde tas varsa aktif
    const hasTiles = rackLayout.some(Boolean);
    if (ciftDizBtn) ciftDizBtn.disabled = !hasTiles;
    if (seriDizBtn) seriDizBtn.disabled = !hasTiles;
  }

  if (ciftDizBtn) ciftDizBtn.addEventListener('click', () => ciftDiz(lastState ? lastState.okeySpec : null));
  if (seriDizBtn) seriDizBtn.addEventListener('click', () => seriDiz(lastState ? lastState.okeySpec : null));

  let hasAutoSat = false;
  socket.on('okey:state', (state) => {
    lastState = state;
    const myIndex = state.seats.findIndex((s) => s && s.userId === CURRENT_USER_ID);
    if (myIndex === -1 || state.stage === 'waiting') {
      rackLayout = new Array(RACK_SLOTS).fill(null);
      serverTiles = [];
    }
    const titleEl = document.getElementById('okey-title');
    if (titleEl) {
      const gMode = state.gameMode || 'Tekli';
      const gType = state.gameType || 'Katlamasız';
      titleEl.innerText = `Okey - ${gMode} / ${gType}`;
    }
    renderSeats(state);
    renderIndicator(state);
    renderDeckAndCorners(state);
    renderStatus(state);
    renderBanner(state);
    renderRack(state);
    renderActionBar(state);

    if (!hasAutoSat && new URLSearchParams(window.location.search).get('autoSit') === 'true') {
      hasAutoSat = true;
      if (myIndex === -1) {
        const emptyIdx = state.seats.findIndex((s) => !s);
        if (emptyIdx !== -1) {
          socket.emit('okey:sit', { seatIndex: emptyIdx });
        }
      }
    }
  });

  socket.on('okey:tiles', (tiles) => {
    serverTiles = tiles;
    syncRackLayout(tiles, lastState ? lastState.okeySpec : null);
    renderRack(lastState);
    renderActionBar(lastState);
  });

  socket.on('okey:error', (msg) => showToast(msg));

  // --- Emotes & Gifts ---
  function showEmote(userId, emote) {
    const bubble = document.getElementById('emote-bubble-' + userId);
    if (!bubble) return;
    bubble.textContent = emote;
    bubble.classList.add('show');
    if (window.LootivSound) LootivSound.play('notify');
    setTimeout(() => bubble.classList.remove('show'), 3000);
  }

  function flyChip(fromUserId, toUserId) {
    if (!lastState) return;
    const fromSeat = lastState.seats.findIndex(s => s && s.userId === fromUserId);
    const toSeat = lastState.seats.findIndex(s => s && s.userId === toUserId);
    if (fromSeat === -1 || toSeat === -1) return;
    const fromEl = seatsEl.querySelector('.okey-seat-pos-' + fromSeat);
    const toEl = seatsEl.querySelector('.okey-seat-pos-' + toSeat);
    if (!fromEl || !toEl) return;

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();
    
    const chip = document.createElement('div');
    chip.className = 'flying-chip';
    chip.style.left = (fromRect.left + fromRect.width / 2 - 12) + 'px';
    chip.style.top = (fromRect.top + fromRect.height / 2 - 12) + 'px';
    document.body.appendChild(chip);

    if (window.LootivSound) LootivSound.play('chip');

    setTimeout(() => {
      chip.style.left = (toRect.left + toRect.width / 2 - 12) + 'px';
      chip.style.top = (toRect.top + toRect.height / 2 - 12) + 'px';
    }, 50);

    setTimeout(() => {
      chip.remove();
      if (window.LootivSound) LootivSound.play('chip');
    }, 650);
  }

  socket.on('okey:emote', (data) => showEmote(data.userId, data.emote));
  socket.on('okey:gift', (data) => flyChip(data.fromUserId, data.targetUserId));

  const emoteToggleBtn = document.getElementById('emote-toggle-btn');
  const emotePicker = document.getElementById('emote-picker');
  if (emoteToggleBtn && emotePicker) {
    emoteToggleBtn.addEventListener('click', () => {
      emotePicker.style.display = emotePicker.style.display === 'none' ? 'flex' : 'none';
    });
    document.querySelectorAll('.emote-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        socket.emit('okey:emote', { emote: btn.dataset.emote });
        emotePicker.style.display = 'none';
      });
    });
  }
})();
