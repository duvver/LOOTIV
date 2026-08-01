/* LOOTIV ana sayfa (Nexus Play tema): aktif oyuncular + LT ve genel sohbet. */
(function () {
  if (typeof io === 'undefined') return;

  var gameId = window.LOBBY_GAME_ID || 'lobby';
  var socket = io({ query: { game: gameId }, forceNew: true });
  window.lobbySocket = socket;

  var onlineList = document.getElementById('lobby-online-list');
  var onlineCount = document.getElementById('lobby-online-count');
  var chatMessages = document.getElementById('lobby-chat-messages');
  var chatForm = document.getElementById('lobby-chat-form');
  var chatInput = document.getElementById('lobby-chat-input');

  var genelMessages = [];

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function formatTime(isoLike) {
    try {
      var d = new Date(String(isoLike).replace(' ', 'T') + 'Z');
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  function ltText(n) {
    return (Number(n) || 0).toLocaleString('tr-TR') + ' LT';
  }

  // ---- Aktif oyuncular ----
  function renderOnline(list) {
    if (onlineCount) onlineCount.textContent = String(list.length);
    // Oyun kartindaki "aktif oyuncu" rozetleri
    document.querySelectorAll('.lobby-online-count-badge').forEach(function (el) {
      el.textContent = String(list.length);
    });
    if (!onlineList) return;
    if (!list.length) {
      onlineList.innerHTML = '<li class="text-outline text-body-sm px-3 py-2">Su an aktif kullanici yok.</li>';
      return;
    }
    onlineList.innerHTML = list.map(function (p) {
      var initial = (p.rumuz || '?').charAt(0).toUpperCase();
      var avatar = p.avatar
        ? '<img src="' + escapeHtml(p.avatar) + '" class="w-full h-full object-cover" alt="" />'
        : '<span>' + escapeHtml(initial) + '</span>';
      var vip = p.vip > 0
        ? '<span class="text-[10px] px-1.5 py-0.5 bg-energetic-purple/15 text-energetic-purple rounded-full font-label-md">VIP' + escapeHtml(p.vip) + '</span>'
        : '';
      return (
        '<li class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-container-low transition-colors">' +
          '<span class="relative flex-shrink-0">' +
            '<span class="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center font-bold overflow-hidden">' + avatar + '</span>' +
            '<span class="absolute bottom-0 right-0 w-2.5 h-2.5 bg-success-green border-2 border-white rounded-full"></span>' +
          '</span>' +
          '<span class="min-w-0 flex-1">' +
            '<span class="flex items-center gap-1.5 font-label-md text-label-md text-on-surface truncate">' + escapeHtml(p.rumuz) + vip + '</span>' +
            '<span class="block text-label-sm text-secondary font-semibold">' + escapeHtml(ltText(p.lt)) + '</span>' +
          '</span>' +
        '</li>'
      );
    }).join('');
  }

  socket.on('lobby:players', renderOnline);

  // ---- Sohbet ----
  function renderMessages() {
    if (!chatMessages) return;
    chatMessages.innerHTML = genelMessages.map(function (m) {
      if (m.channel === 'sistem') {
        return '<div class="theme-chat-msg sys"><span class="txt">' + escapeHtml(m.content) + '</span></div>';
      }
      return (
        '<div class="theme-chat-msg">' +
          '<span class="who">' + escapeHtml(m.username) + '</span> ' +
          '<span class="txt text-on-surface">' + escapeHtml(m.content) + '</span> ' +
          '<span class="text-[10px] text-outline ml-1">' + formatTime(m.created_at) + '</span>' +
        '</div>'
      );
    }).join('');
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  socket.on('chat:history', function (history) {
    genelMessages = (history && history.genel) ? history.genel : [];
    renderMessages();
  });

  socket.on('chat:message', function (msg) {
    if (!msg) return;
    if (msg.channel !== 'genel' && msg.channel !== 'sistem') return;
    genelMessages.push(msg);
    if (genelMessages.length > 200) genelMessages.shift();
    renderMessages();
  });

  if (chatForm) {
    chatForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = chatInput.value.trim();
      if (!text) return;
      socket.emit('chat:message', { channel: 'genel', text: text });
      chatInput.value = '';
    });
  }
})();
