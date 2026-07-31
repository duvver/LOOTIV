(() => {
  const socket = io({ query: { game: 'poker' } });

  const playerList = document.getElementById('player-list');
  const playerCount = document.getElementById('player-count');
  const chatMessages = document.getElementById('chat-messages');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const tabs = Array.from(document.querySelectorAll('.chat-tab'));

  const messagesByChannel = { oyun: [], sistem: [] };
  let activeChannel = 'oyun';

  function formatTime(isoLike) {
    const d = new Date(isoLike.replace(' ', 'T') + 'Z');
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
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

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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
    socket.emit('chat:message', { channel: activeChannel, text });
    chatInput.value = '';
  });

  socket.on('chat:history', (history) => {
    // Sunucudan genel, poker, vs. gelirse onu oyun kanalına yönlendirelim
    const histOyun = [...(history.genel || []), ...(history.poker || []), ...(history.oyun || [])]
      .sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
    messagesByChannel['oyun'] = histOyun;
    if (history.sistem) messagesByChannel['sistem'] = history.sistem;
    
    renderMessages();
  });

  socket.on('chat:message', (msg) => {
    const ch = msg.channel === 'sistem' ? 'sistem' : 'oyun';
    if (!messagesByChannel[ch]) messagesByChannel[ch] = [];
    messagesByChannel[ch].push(msg);
    if (messagesByChannel[ch].length > 200) messagesByChannel[ch].shift();
    
    if (ch === activeChannel) {
      renderMessages();
    } else {
      const tab = tabs.find((t) => t.dataset.channel === ch);
      if (tab) tab.classList.add('has-new');
    }
  });

  socket.on('poker:players', (players) => {
    playerCount.textContent = String(players.length);
    playerList.innerHTML = players
      .map((name) => `<li class="player-item"><span class="player-dot"></span>${escapeHtml(name)}</li>`)
      .join('');
  });

  // ---------------- Poker table ----------------
  const CURRENT_USER_ID = Number(document.body.dataset.userId);
  const STAGE_NAMES = {
    waiting: 'Bekleniyor',
    preflop: 'Preflop',
    flop: 'Flop',
    turn: 'Turn',
    river: 'River',
    showdown: 'Showdown',
  };

  const seatsEl = document.getElementById('table-seats');
  const communityEl = document.getElementById('table-community');
  const potEl = document.getElementById('table-pot');
  const statusEl = document.getElementById('table-status');
  const bannerEl = document.getElementById('table-banner');
  const actionBarEl = document.getElementById('action-bar');

  let myHoleCards = [];
  let lastState = null;
  let countdownInterval = null;
  let toastTimer = null;

  function showToast(msg) {
    let toast = document.getElementById('table-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'table-toast';
      toast.className = 'table-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 3000);
  }

  function renderCard(label, faceDown) {
    if (faceDown) return '<div class="card card-back"></div>';
    const suit = label.slice(-1);
    const rank = label.slice(0, -1);
    const isRed = suit === '♥' || suit === '♦';
    return `<div class="card ${isRed ? 'card-red' : 'card-black'}"><span class="card-rank">${escapeHtml(rank)}</span><span class="card-suit">${escapeHtml(suit)}</span></div>`;
  }

  function renderSeats(state) {
    const myIndex = state.seats.findIndex((s) => s && s.userId === CURRENT_USER_ID);

    seatsEl.innerHTML = state.seats
      .map((seat, i) => {
        if (!seat) {
          const canSit = myIndex === -1;
          return `
            <div class="seat seat-pos-${i} seat-empty">
              ${canSit
                ? `<button type="button" class="seat-sit-btn" data-seat="${i}">Otur<span>${state.buyIn} LT</span></button>`
                : '<div class="seat-empty-label">Bos</div>'}
            </div>
          `;
        }

        const isMe = seat.userId === CURRENT_USER_ID;
        let cardsHtml = '';
        if (seat.revealed) {
          cardsHtml = seat.revealed.map((c) => renderCard(c)).join('');
        } else if (isMe && myHoleCards.length) {
          cardsHtml = myHoleCards.map((c) => renderCard(c)).join('');
        } else if (seat.cardCount > 0) {
          cardsHtml = Array(seat.cardCount).fill(0).map(() => renderCard(null, true)).join('');
        }

        return `
          <div class="seat seat-pos-${i} ${seat.folded ? 'seat-folded' : ''} ${seat.isTurn ? 'seat-turn' : ''}">
            ${seat.isDealer ? '<div class="seat-dealer-badge">D</div>' : ''}
            ${seat.allIn ? '<div class="seat-allin-tag">ALL-IN</div>' : ''}
            <div class="seat-cards">${cardsHtml}</div>
            <div class="seat-info ${isMe ? 'seat-info-me' : ''}">
              <div class="seat-name">${escapeHtml(seat.name)}${seat.leavingAfterHand ? ' <span class="seat-leaving">(ayriliyor)</span>' : ''}</div>
              <div class="seat-stack">${seat.stack} LT</div>
              ${isMe ? '<button type="button" class="seat-stand-btn" id="stand-btn">Kalk</button>' : ''}
            </div>
            ${seat.bet > 0 ? `<div class="seat-bet-chip">${seat.bet}</div>` : ''}
          </div>
        `;
      })
      .join('');

    seatsEl.querySelectorAll('.seat-sit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        socket.emit('table:sit', { seatIndex: Number(btn.dataset.seat) });
      });
    });
    const standBtn = document.getElementById('stand-btn');
    if (standBtn) standBtn.addEventListener('click', () => socket.emit('table:stand'));
  }

  function renderCommunity(state) {
    communityEl.innerHTML = state.community.map((c) => renderCard(c)).join('');
  }

  function renderPot(state) {
    potEl.textContent = state.pot > 0 ? `Pot: ${state.pot} LT` : '';
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
        statusEl.textContent = 'Masaya en az 2 kisi oturunca el otomatik baslar.';
      }
    } else {
      statusEl.textContent = `${STAGE_NAMES[state.stage] || ''} — El #${state.handNumber}`;
    }
  }

  function renderBanner(state) {
    if (state.stage === 'showdown' && state.lastHandSummary) {
      const winners = state.lastHandSummary.winners
        .map((w) => `${escapeHtml(w.name)} (+${w.amount}, ${escapeHtml(w.handName)})`)
        .join(', ');
      bannerEl.innerHTML = `<div class="banner-inner">Kazanan: ${winners}</div>`;
      bannerEl.classList.add('visible');
    } else {
      bannerEl.classList.remove('visible');
      bannerEl.innerHTML = '';
    }
  }

  function renderActionBar(state) {
    const myIndex = state.seats.findIndex((s) => s && s.userId === CURRENT_USER_ID);
    const mySeat = myIndex === -1 ? null : state.seats[myIndex];

    if (!mySeat || state.turnSeat !== myIndex || mySeat.folded) {
      actionBarEl.innerHTML = '';
      actionBarEl.classList.remove('visible');
      return;
    }

    const toCall = state.currentBet - mySeat.bet;
    const maxBet = mySeat.stack + mySeat.bet;
    const minRaiseTo = Math.min(state.currentBet + state.minRaise, maxBet);

    actionBarEl.classList.add('visible');
    actionBarEl.innerHTML = `
      <button type="button" class="action-btn action-fold" id="act-fold">Fold</button>
      ${toCall > 0
        ? `<button type="button" class="action-btn action-call" id="act-call">Call ${toCall}</button>`
        : `<button type="button" class="action-btn action-check" id="act-check">Check</button>`}
      ${maxBet > state.currentBet
        ? `
        <div class="raise-control">
          <input type="range" id="raise-slider" min="${minRaiseTo}" max="${maxBet}" value="${minRaiseTo}" step="1" />
          <span id="raise-amount">${minRaiseTo}</span>
          <button type="button" class="action-btn action-raise" id="act-raise">Raise</button>
        </div>`
        : ''}
      <button type="button" class="action-btn action-allin" id="act-allin">All-in (${maxBet})</button>
    `;

    document.getElementById('act-fold')?.addEventListener('click', () => socket.emit('table:action', { action: 'fold' }));
    document.getElementById('act-check')?.addEventListener('click', () => socket.emit('table:action', { action: 'check' }));
    document.getElementById('act-call')?.addEventListener('click', () => socket.emit('table:action', { action: 'call' }));
    document.getElementById('act-allin')?.addEventListener('click', () => socket.emit('table:action', { action: 'allin' }));
    const slider = document.getElementById('raise-slider');
    const amountLabel = document.getElementById('raise-amount');
    if (slider) slider.addEventListener('input', () => { amountLabel.textContent = slider.value; });
    document.getElementById('act-raise')?.addEventListener('click', () => {
      socket.emit('table:action', { action: 'raise', amount: Number(slider.value) });
    });
  }

  socket.on('table:state', (state) => {
    lastState = state;
    const myIndex = state.seats.findIndex((s) => s && s.userId === CURRENT_USER_ID);
    if (myIndex === -1 || state.stage === 'waiting') myHoleCards = [];
    renderSeats(state);
    renderCommunity(state);
    renderPot(state);
    renderStatus(state);
    renderBanner(state);
    renderActionBar(state);
  });

  socket.on('table:cards', (cards) => {
    myHoleCards = cards;
    if (lastState) renderSeats(lastState);
  });

  socket.on('table:error', (msg) => showToast(msg));
})();
