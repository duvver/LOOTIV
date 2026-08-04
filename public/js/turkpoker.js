(() => {
  const roomId = new URLSearchParams(window.location.search).get('roomId');
  const socket = io({ query: { game: 'turkpoker', roomId: roomId || '' } });

  const playerList = document.getElementById('player-list');
  const playerCount = document.getElementById('player-count');
  const chatMessages = document.getElementById('chat-messages');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const tabs = Array.from(document.querySelectorAll('.chat-tab'));

  const messagesByChannel = { oyun: [], sistem: [] };
  let activeChannel = 'oyun';

  // --- Sound Engine (Web Audio API) ---
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    if (type === 'deal') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(150, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
      osc.start(); osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'chip') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(3000, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1000, audioCtx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
      osc.start(); osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'win') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(400, audioCtx.currentTime);
      osc.frequency.setValueAtTime(600, audioCtx.currentTime + 0.15);
      osc.frequency.setValueAtTime(800, audioCtx.currentTime + 0.3);
      gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.6);
      osc.start(); osc.stop(audioCtx.currentTime + 0.6);
    }
  }

  // --- Animations ---
  function flyChip(startEl, endEl, amount) {
    if (!startEl || !endEl) return;
    const startRect = startEl.getBoundingClientRect();
    const endRect = endEl.getBoundingClientRect();
    
    const chip = document.createElement('div');
    chip.className = 'flying-chip';
    chip.style.left = startRect.left + startRect.width / 2 - 12 + 'px';
    chip.style.top = startRect.top + startRect.height / 2 - 12 + 'px';
    
    document.body.appendChild(chip);
    playSound('chip');
    
    // trigger reflow
    void chip.offsetWidth;
    
    chip.style.left = endRect.left + endRect.width / 2 - 12 + 'px';
    chip.style.top = endRect.top + endRect.height / 2 - 12 + 'px';
    chip.style.opacity = '0';
    chip.style.transform = 'scale(0.5)';
    
    setTimeout(() => {
      if (chip.parentNode) chip.parentNode.removeChild(chip);
    }, 500);
  }


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
      
    // Handle CSS transitions that need to fire after DOM insertion
    setTimeout(() => {
      document.querySelectorAll('.needs-flip').forEach(el => {
        el.classList.remove('needs-flip');
        el.classList.add('flip');
      });
      // check if any deal animations are present to play sound
      if (document.querySelectorAll('.animate-deal').length > 0) {
        playSound('deal');
      }
    }, 50);
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
      chatInput.placeholder = isSystem ? 'Sistem mesajları salt okunurdur' : 'Mesajını yaz...';
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

  const emoteToggleBtn = document.getElementById('emote-toggle-btn');
  const emotePicker = document.getElementById('emote-picker');
  
  if (emoteToggleBtn && emotePicker) {
    emoteToggleBtn.addEventListener('click', () => {
      emotePicker.style.display = emotePicker.style.display === 'none' ? 'flex' : 'none';
    });

    emotePicker.querySelectorAll('.emote-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const emote = btn.dataset.emote;
        socket.emit('turkpoker:emote', { emote });
        emotePicker.style.display = 'none';
      });
    });

    // Close picker when clicking outside
    document.addEventListener('click', (e) => {
      if (!emoteToggleBtn.contains(e.target) && !emotePicker.contains(e.target)) {
        emotePicker.style.display = 'none';
      }
    });
  }

  socket.on('turkpoker:emote', (payload) => {
    const bubble = document.getElementById(`emote-${payload.userId}`);
    if (bubble) {
      bubble.textContent = payload.emote;
      bubble.classList.add('show');
      setTimeout(() => {
        bubble.classList.remove('show');
      }, 3000);
    }
  });


  socket.on('chat:history', (history) => {
    // Sunucudan genel, turkpoker, vs. gelirse onu oyun kanalına yönlendirelim
    const histOyun = [...(history.genel || []), ...(history.turkpoker || []), ...(history.oyun || [])]
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

  socket.on('turkpoker:players', (players) => {
    playerCount.textContent = String(players.length);
    playerList.innerHTML = players
      .map((name) => `<li class="player-item"><span class="player-dot"></span>${escapeHtml(name)}</li>`)
      .join('');
  });

  // ---------------- Poker table ----------------
  const CURRENT_USER_ID = Number(document.body.dataset.userId);
  const STAGE_NAMES = {
    waiting: 'Bekleniyor',
    betting1: '1. Bahis',
    draw: 'Kart Değiştirme',
    betting2: '2. Bahis',
    showdown: 'Showdown',
  };

  const seatsEl = document.getElementById('table-seats');
  const potEl = document.getElementById('table-pot');
  const statusEl = document.getElementById('table-status');
  const bannerEl = document.getElementById('table-banner');
  const actionBarEl = document.getElementById('action-bar');

  let myHoleCards = [];
  let selectedCardsToDiscard = new Set();
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

  const knownDealtCards = new Set();
  const knownFlippedCards = new Set();

  function renderCard(label, faceDown, index = -1, isSelectable = false, seatIndex = -1, stateStage = '', isMe = false) {
    const cardId = `seat${seatIndex}-card${index}`;
    let classes = 'card-container';
    
    if (stateStage === 'waiting') {
      knownDealtCards.clear();
      knownFlippedCards.clear();
    }
    
    // Deal animation
    let newlyDealt = false;
    if (!knownDealtCards.has(cardId) && stateStage !== 'waiting') {
      knownDealtCards.add(cardId);
      classes += ' animate-deal';
      newlyDealt = true;
    }
    
    // Flip logic for showdown
    let needsFlipTrigger = false;
    if (!faceDown && !isMe) {
      if (!knownFlippedCards.has(cardId)) {
        knownFlippedCards.add(cardId);
        needsFlipTrigger = true;
      } else {
        classes += ' flip';
      }
    } else if (!faceDown && isMe) {
      classes += ' flip'; // My cards are always face up
    }
    
    if (needsFlipTrigger) classes += ' needs-flip';
    
    const suit = label ? label.slice(-1) : '';
    const rank = label ? label.slice(0, -1) : '';
    const isRed = suit === '♥' || suit === '♦';
    const isSelected = selectedCardsToDiscard.has(index);
    
    if (isSelectable) classes += ' selectable-card';
    if (isSelected) classes += ' card-selected';
    
    const attrs = isSelectable ? ` data-card-index="${index}"` : '';
    const colorClass = isRed ? 'card-red' : 'card-black';
    
    // Set a staggered animation delay based on seatIndex and card index
    const animStyle = newlyDealt ? ` style="animation-delay: ${(seatIndex * 100) + (index * 50)}ms;"` : '';
    
    return `
      <div class="${classes}"${attrs}${animStyle}>
        <div class="card-inner">
          <div class="card-front ${colorClass}">
             ${label ? `<span class="card-rank">${escapeHtml(rank)}</span><span class="card-suit">${escapeHtml(suit)}</span>` : ''}
          </div>
          <div class="card-back"></div>
        </div>
      </div>
    `;
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
                : '<div class="seat-empty-label">Boş</div>'}
              <button type="button" class="seat-bot-btn" data-seat="${i}" style="margin-top: 5px; font-size: 0.8rem; padding: 2px 5px;">+ Bot</button>
            </div>
          `;
        }

        const isMe = seat.userId === CURRENT_USER_ID;
        let cardsHtml = '';
        const isDrawPhase = state.stage === 'draw' && isMe && !seat.hasDrawn && !seat.folded;
        
        if (seat.revealed) {
          cardsHtml = seat.revealed.map((c, idx) => renderCard(c, false, idx, false, i, state.stage, isMe)).join('');
        } else if (isMe && myHoleCards.length) {
          cardsHtml = myHoleCards.map((c, idx) => renderCard(c, false, idx, isDrawPhase, i, state.stage, isMe)).join('');
        } else if (seat.cardCount > 0) {
          cardsHtml = Array(seat.cardCount).fill(0).map((_, idx) => renderCard(null, true, idx, false, i, state.stage, isMe)).join('');
        }

        return `
          <div class="seat seat-pos-${i} ${isMe ? 'seat-me' : ''} ${seat.folded ? 'seat-folded' : ''} ${seat.isTurn ? 'seat-turn' : ''} ${seat.isDisconnected ? 'seat-disconnected' : ''} ${seat.isSittingOut ? 'seat-sitting-out' : ''}" id="seat-${i}">
            ${seat.allIn ? '<div class="seat-allin-tag">ALL-IN</div>' : ''}
            <div class="seat-emote-bubble" id="emote-${seat.userId}"></div>
            <div class="seat-cards">${cardsHtml}</div>
            <div class="seat-info ${isMe ? 'seat-info-me' : ''}">
              <div class="seat-name">${escapeHtml(seat.name)}${seat.leavingAfterHand ? ' <span class="seat-leaving">(ayrılıyor)</span>' : ''}</div>
              <div class="seat-stack"><span class="poker-chip"></span> ${seat.stack} LT</div>
              ${seat.isDisconnected ? '<div class="seat-disconnected-label" style="font-size: 0.7rem; color: #ff4d4f;">Bağlantı Koptu</div>' : ''}
              ${seat.isSittingOut && !seat.isDisconnected ? '<div class="seat-sitting-out-label" style="font-size: 0.7rem; color: #faad14;">Bekliyor</div>' : ''}
              <div style="display:flex; justify-content:center; gap: 5px; margin-top: 5px;">
                ${isMe ? '<button type="button" class="seat-stand-btn" id="stand-btn">Kalk</button>' : ''}
                ${!isMe && !seat.isBot ? `<button type="button" class="seat-gift-btn" data-target-id="${seat.userId}" title="Hediye 100 LT gönder">🎁</button>` : ''}
              </div>
            </div>
            ${seat.bet > 0 ? `<div class="seat-bet-chip">${seat.bet}</div>` : ''}
          </div>
        `;
      })
      .join('');

    seatsEl.querySelectorAll('.seat-sit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        socket.emit('turkpoker:sit', { seatIndex: Number(btn.dataset.seat) });
      });
    });
    seatsEl.querySelectorAll('.seat-bot-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        socket.emit('turkpoker:addbot', { seatIndex: Number(btn.dataset.seat) });
      });
    });
    const standBtn = document.getElementById('stand-btn');
    if (standBtn) standBtn.addEventListener('click', () => socket.emit('turkpoker:stand'));
    
    seatsEl.querySelectorAll('.seat-gift-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const targetId = Number(btn.dataset.targetId);
        if (confirm('100 LT hediye etmek istediğinize emin misiniz?')) {
          socket.emit('turkpoker:gift', { targetUserId: targetId });
        }
      });
    });

    // Card selection event delegation for Turkish Poker discard phase (up to 4 cards)
    seatsEl.querySelectorAll('.selectable-card').forEach(cardEl => {
      cardEl.addEventListener('click', (e) => {
        const idx = Number(cardEl.dataset.cardIndex);
        if (selectedCardsToDiscard.has(idx)) {
          selectedCardsToDiscard.delete(idx);
          cardEl.classList.remove('card-selected');
        } else {
          if (selectedCardsToDiscard.size < 4) {
            selectedCardsToDiscard.add(idx);
            cardEl.classList.add('card-selected');
          } else {
            showToast('En fazla 4 kart değiştirebilirsiniz.');
          }
        }
        
        const discardBtn = document.getElementById('act-discard');
        if (discardBtn) {
          discardBtn.textContent = `Değiştir (${selectedCardsToDiscard.size})`;
          const infoEl = actionBarEl.querySelector('.action-info');
          if (infoEl) infoEl.textContent = `Değiştirilecek kartlar: ${selectedCardsToDiscard.size}/4`;
        }
      });
    });
  }

  function renderPot(state) {
    potEl.innerHTML = state.pot > 0 ? `<span class="poker-chip"></span> <span class="pot-value">Pot: ${state.pot} LT</span>` : '';
  }

  function renderStatus(state) {
    clearInterval(countdownInterval);
    if (state.stage === 'waiting') {
      if (state.nextHandAt) {
        const tick = () => {
          const remain = Math.max(0, Math.ceil((state.nextHandAt - Date.now()) / 1000));
          statusEl.textContent = `Yeni el ${remain} saniye içinde başlıyor...`;
          if (remain <= 0) clearInterval(countdownInterval);
        };
        tick();
        countdownInterval = setInterval(tick, 500);
      } else {
        statusEl.textContent = 'Masaya en az 2 kişi oturunca el otomatik başlar.';
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
      let rakeText = '';
      if (state.lastHandSummary.rake > 0) {
        rakeText = ` | Kesilen Komisyon: ${state.lastHandSummary.rake} LT`;
      }
      bannerEl.innerHTML = `<div class="banner-inner">Kazanan: ${winners}${rakeText}</div>`;
      bannerEl.classList.add('visible');
    } else {
      bannerEl.classList.remove('visible');
      bannerEl.innerHTML = '';
    }
  }

  function renderActionBar(state) {
    const myIndex = state.seats.findIndex((s) => s && s.userId === CURRENT_USER_ID);
    const mySeat = myIndex === -1 ? null : state.seats[myIndex];

    if (!mySeat || mySeat.folded) {
      actionBarEl.innerHTML = '';
      actionBarEl.classList.remove('visible');
      return;
    }

    if (state.stage === 'draw' && !mySeat.hasDrawn) {
      actionBarEl.classList.add('visible');
      actionBarEl.innerHTML = `
        <div class="action-info">Değiştirilecek kartlar: ${selectedCardsToDiscard.size}/4</div>
        <button type="button" class="action-btn action-call" id="act-discard">Değiştir (${selectedCardsToDiscard.size})</button>
      `;
      document.getElementById('act-discard')?.addEventListener('click', () => {
        socket.emit('turkpoker:action', { action: 'discard', cards: Array.from(selectedCardsToDiscard) });
      });
      return;
    }

    if (state.turnSeat !== myIndex || state.stage === 'draw') {
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

    document.getElementById('act-fold')?.addEventListener('click', () => socket.emit('turkpoker:action', { action: 'fold' }));
    document.getElementById('act-check')?.addEventListener('click', () => socket.emit('turkpoker:action', { action: 'check' }));
    document.getElementById('act-call')?.addEventListener('click', () => socket.emit('turkpoker:action', { action: 'call' }));
    document.getElementById('act-allin')?.addEventListener('click', () => socket.emit('turkpoker:action', { action: 'allin' }));
    const slider = document.getElementById('raise-slider');
    const amountLabel = document.getElementById('raise-amount');
    if (slider) slider.addEventListener('input', () => { amountLabel.textContent = slider.value; });
    document.getElementById('act-raise')?.addEventListener('click', () => {
      socket.emit('turkpoker:action', { action: 'raise', amount: Number(slider.value) });
    });
  }

  socket.on('turkpoker:state', (state) => {
    lastState = state;
    const myIndex = state.seats.findIndex((s) => s && s.userId === CURRENT_USER_ID);
    if (myIndex === -1 || state.stage === 'waiting') {
      myHoleCards = [];
      selectedCardsToDiscard.clear();
    }
    if (state.stage !== 'draw') {
      selectedCardsToDiscard.clear();
    }
    const titleEl = document.getElementById('turkpoker-title');
    if (titleEl) {
      const gMode = state.gameMode || 'Tekli';
      const gType = state.gameType || 'Standart';
      const rakeStr = state.rakePercent ? ` | Komisyon: %${Math.round(state.rakePercent * 100)}` : '';
      titleEl.innerText = `Türk Pokeri - ${gMode} / ${gType}${rakeStr}`;
    }
    renderSeats(state);
    renderPot(state);
    renderStatus(state);
    renderBanner(state);
    renderActionBar(state);
  });
  
  socket.on('turkpoker:animation', (payload) => {
    if (payload.type === 'chip-bet') {
      const startEl = document.querySelector(`.seat-pos-${payload.seatIndex}`);
      const endEl = document.querySelector(`.table-pot`);
      flyChip(startEl, endEl, payload.amount);
    } else if (payload.type === 'chip-win') {
      const startEl = document.querySelector(`.table-pot`);
      const endEl = document.querySelector(`.seat-pos-${payload.seatIndex}`);
      flyChip(startEl, endEl, payload.amount);
      playSound('win');
    }
  });

  socket.on('turkpoker:cards', (cards) => {
    myHoleCards = cards;
    if (lastState) renderSeats(lastState);
  });

  socket.on('turkpoker:error', (msg) => showToast(msg));
  socket.on('redirect', (url) => { window.location.href = url; });

  // --- Leaderboard Logic ---
  const btnLeaderboard = document.getElementById('btn-leaderboard');
  const leaderboardModal = document.getElementById('leaderboard-modal');
  const leaderboardClose = document.getElementById('leaderboard-close');
  const leaderboardBody = document.getElementById('leaderboard-body');

  function getHandName(rank) {
    if (rank >= 9000000) return 'Floş Royal';
    if (rank >= 8000000) return 'Renk Serisi';
    if (rank >= 7000000) return 'Kare';
    if (rank >= 6000000) return 'Renk';
    if (rank >= 5000000) return 'Ful';
    if (rank >= 4000000) return 'Kent';
    if (rank >= 3000000) return 'Üçlü';
    if (rank >= 2000000) return 'Döper';
    if (rank >= 1000000) return 'Per';
    return 'Yüksek Kart';
  }

  if (btnLeaderboard) {
    btnLeaderboard.addEventListener('click', async () => {
      leaderboardModal.style.display = 'flex';
      leaderboardBody.innerHTML = '<tr><td colspan="8" class="text-center">Yükleniyor...</td></tr>';
      try {
        const res = await fetch('/api/turkpoker-leaderboard');
        const data = await res.json();
        if (data.success && data.players) {
          leaderboardBody.innerHTML = data.players.map((p, idx) => {
            const winRate = p.hands_played > 0 ? Math.round((p.hands_won / p.hands_played) * 100) : 0;
            const aggression = p.actions_taken > 0 ? Math.round((p.raises_made / p.actions_taken) * 100) : 0;
            
            return `
              <tr>
                <td style="padding: 10px;">${idx + 1}</td>
                <td style="padding: 10px;">
                  <img src="${p.avatar_url || '/images/default-avatar.png'}" style="width: 24px; height: 24px; border-radius: 50%; vertical-align: middle; margin-right: 8px;">
                  ${p.rumuz}
                </td>
                <td style="padding: 10px; color: ${p.total_lt_won >= p.total_lt_lost ? '#00ff88' : '#ff0055'};">
                  ${p.total_lt_won - p.total_lt_lost} LT
                </td>
                <td style="padding: 10px; color: var(--gold-bright);">${p.biggest_pot_won} LT</td>
                <td style="padding: 10px;">${getHandName(p.highest_hand_rank)}</td>
                <td style="padding: 10px;">${p.hands_played}</td>
                <td style="padding: 10px;">%${winRate}</td>
                <td style="padding: 10px;">%${aggression}</td>
              </tr>
            `;
          }).join('') || '<tr><td colspan="8" class="text-center">Henüz kayıt yok.</td></tr>';
        }
      } catch (err) {
        leaderboardBody.innerHTML = '<tr><td colspan="8" class="text-center">Hata oluştu.</td></tr>';
      }
    });
  }

  if (leaderboardClose) {
    leaderboardClose.addEventListener('click', () => {
      leaderboardModal.style.display = 'none';
    });
  }

  if (leaderboardModal) {
    leaderboardModal.addEventListener('click', (e) => {
      if (e.target === leaderboardModal) {
        leaderboardModal.style.display = 'none';
      }
    });
  }
})();
