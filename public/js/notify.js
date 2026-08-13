/* LOOTIV duyuru bildirimleri.
   Her sayfada calisir; admin bir duyuru yayinladiginda aninda toast gosterir
   ve ust menudeki "Duyurular" rozetini gunceller. */
(function () {
  if (typeof io === 'undefined') return;

  // Sadece duyuru dinlemek icin hafif bir baglanti ac.
  var socket;
  try {
    socket = io({ query: { game: 'notify' }, forceNew: true });
  } catch (e) {
    return;
  }

  function bumpBadge() {
    var badge = document.getElementById('nav-announce-badge');
    if (!badge) return;
    var current = parseInt(badge.textContent, 10);
    if (isNaN(current)) current = 0;
    badge.textContent = String(current + 1);
    badge.hidden = false;
  }

  function showToast(payload) {
    var toast = document.createElement('div');
    toast.className = 'announce-toast';
    var title = document.createElement('div');
    title.className = 'announce-toast-title';
    title.textContent = '\uD83D\uDCE2 ' + (payload.title || 'Yeni Duyuru');
    var body = document.createElement('div');
    body.className = 'announce-toast-body';
    var text = payload.content || '';
    body.textContent = text.length > 140 ? text.slice(0, 140) + '...' : text;
    var foot = document.createElement('a');
    foot.className = 'announce-toast-link';
    foot.href = payload.link || '/duyurular';
    foot.textContent = payload.linkText || 'Duyurulari gor';
    toast.appendChild(title);
    toast.appendChild(body);
    toast.appendChild(foot);

    var wrap = document.getElementById('announce-toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'announce-toast-wrap';
      wrap.className = 'announce-toast-wrap';
      document.body.appendChild(wrap);
    }
    wrap.appendChild(toast);

    // Girisi animasyonla
    requestAnimationFrame(function () {
      toast.classList.add('visible');
    });

    // 8 saniye sonra kaldir
    setTimeout(function () {
      toast.classList.remove('visible');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 8000);

    // Tiklaninca kapat
    toast.addEventListener('click', function (ev) {
      if (ev.target === foot) return; // linke tiklamayi engelleme
      toast.classList.remove('visible');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    });
  }

  socket.on('announcement:new', function (payload) {
    if (!payload) return;
    bumpBadge();
    showToast(payload);
  });

  socket.on('room:invited', function (payload) {
    if (!payload) return;
    showToast({
      title: 'Oyun Daveti!',
      content: payload.from + ' sizi masasına davet ediyor.',
      link: '/oyun/' + payload.game + '?roomId=' + payload.roomId,
      linkText: 'Masaya Katıl'
    });
  });

})();
