content = """<!DOCTYPE html>
<html lang="tr">
<head>
  <%- include('partials/theme-head', { title: 'VIP Satın Al - LOOTIV' }) %>
</head>
<body class="bg-surface text-on-surface font-body min-h-screen flex flex-col">
  <%- include('partials/theme-nav') %>

  <!-- Ana Icerik -->
  <main class="flex-1 w-full max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-8 md:py-16">
    <div class="mb-12 text-center">
      <h1 class="text-4xl md:text-5xl font-display-lg text-primary font-bold mb-4 drop-shadow-md">VIP Ayrıcalıklarını Keşfet</h1>
      <p class="text-outline text-lg md:text-xl max-w-2xl mx-auto">Oyun deneyiminizi bir üst seviyeye taşıyın. Size en uygun VIP paketini seçin, haftalık maaşlar, anında hediyeler ve özel ayrıcalıkların tadını çıkarın!</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
      
      <!-- VIP 1 -->
      <div class="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-3xl p-6 md:p-8 flex flex-col gap-6 relative group overflow-hidden shadow-2xl">
        <div class="absolute -top-10 -right-10 w-32 h-32 bg-slate-600 rounded-full blur-3xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
        <div class="text-center pb-6 border-b border-white/10 z-10">
          <h3 class="text-2xl font-bold text-slate-300 tracking-wide">VIP 1</h3>
          <div class="mt-4 flex items-baseline justify-center gap-1">
            <span class="text-4xl font-extrabold text-white">Bronz Paket</span>
          </div>
        </div>
        <div class="flex-1 z-10">
          <ul class="space-y-4">
            <li class="flex items-start gap-3">
              <span class="material-symbols-outlined text-green-400 shrink-0">check_circle</span>
              <span class="text-sm font-medium text-slate-300">Anında <strong class="text-white text-base">10.000 LT</strong> Hediye</span>
            </li>
            <li class="flex items-start gap-3">
              <span class="material-symbols-outlined text-green-400 shrink-0">check_circle</span>
              <span class="text-sm font-medium text-slate-300">Haftalık <strong class="text-white text-base">10.000 LT</strong> Maaş</span>
            </li>
            <li class="flex items-start gap-3">
              <span class="material-symbols-outlined text-green-400 shrink-0">check_circle</span>
              <span class="text-sm font-medium text-slate-300">Özel VIP 1 Profil Çerçevesi</span>
            </li>
            <li class="flex items-start gap-3">
              <span class="material-symbols-outlined text-green-400 shrink-0">check_circle</span>
              <span class="text-sm font-medium text-slate-300">Özel Mesaj Gönderme İzni</span>
            </li>
          </ul>
        </div>
        <div class="mt-6 flex flex-col gap-3 z-10">
          <p class="text-center text-xs text-slate-400 mb-1">Güvenli Satın Alım Noktaları:</p>
          <a href="#" target="_blank" class="w-full text-center px-4 py-3.5 bg-[#ff7300] hover:bg-[#e66800] text-white font-bold rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 hover:-translate-y-0.5">
            ByNoGame ile Al
          </a>
          <a href="#" target="_blank" class="w-full text-center px-4 py-3.5 bg-[#1e40af] hover:bg-[#1e3a8a] text-white font-bold rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 hover:-translate-y-0.5">
            Kopazar ile Al
          </a>
        </div>
      </div>

      <!-- VIP 2 -->
      <div class="bg-gradient-to-br from-indigo-600 via-purple-600 to-fuchsia-700 border border-purple-400/30 rounded-3xl p-6 md:p-8 flex flex-col gap-6 relative group overflow-hidden shadow-2xl scale-100 md:scale-105 z-20">
        <div class="absolute top-0 left-1/2 -translate-x-1/2 bg-yellow-400 text-yellow-950 font-black text-[10px] tracking-widest uppercase px-4 py-1 rounded-b-xl shadow-md">En Popüler</div>
        <div class="absolute -top-10 -right-10 w-32 h-32 bg-white rounded-full blur-3xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
        <div class="text-center pb-6 border-b border-white/20 z-10 pt-4">
          <h3 class="text-2xl font-bold text-purple-100 tracking-wide">VIP 2</h3>
          <div class="mt-4 flex items-baseline justify-center gap-1">
            <span class="text-4xl font-extrabold text-white drop-shadow-md">Gümüş Paket</span>
          </div>
        </div>
        <div class="flex-1 z-10">
          <ul class="space-y-4">
            <li class="flex items-start gap-3">
              <span class="material-symbols-outlined text-yellow-300 shrink-0">stars</span>
              <span class="text-sm font-medium text-purple-50">Anında <strong class="text-white text-base">20.000 LT</strong> Hediye</span>
            </li>
            <li class="flex items-start gap-3">
              <span class="material-symbols-outlined text-yellow-300 shrink-0">stars</span>
              <span class="text-sm font-medium text-purple-50">Haftalık <strong class="text-white text-base">15.000 LT</strong> Maaş</span>
            </li>
            <li class="flex items-start gap-3">
              <span class="material-symbols-outlined text-yellow-300 shrink-0">stars</span>
              <span class="text-sm font-medium text-purple-50">Tüm VIP 1 Özellikleri</span>
            </li>
            <li class="flex items-start gap-3">
              <span class="material-symbols-outlined text-yellow-300 shrink-0">stars</span>
              <span class="text-sm font-medium text-purple-50">Animasyonlu Profil Çerçevesi</span>
            </li>
            <li class="flex items-start gap-3">
              <span class="material-symbols-outlined text-yellow-300 shrink-0">stars</span>
              <span class="text-sm font-medium text-purple-50">Sohbetlerde Renkli İsim</span>
            </li>
          </ul>
        </div>
        <div class="mt-6 flex flex-col gap-3 z-10">
          <p class="text-center text-xs text-purple-200 mb-1">Güvenli Satın Alım Noktaları:</p>
          <a href="#" target="_blank" class="w-full text-center px-4 py-3.5 bg-[#ff7300] hover:bg-[#e66800] text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 hover:-translate-y-1">
            ByNoGame ile Al
          </a>
          <a href="#" target="_blank" class="w-full text-center px-4 py-3.5 bg-[#1e40af] hover:bg-[#1e3a8a] text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 hover:-translate-y-1">
            Kopazar ile Al
          </a>
        </div>
      </div>

      <!-- VIP 3 -->
      <div class="bg-gradient-to-br from-amber-600 via-orange-600 to-rose-700 border border-orange-400/30 rounded-3xl p-6 md:p-8 flex flex-col gap-6 relative group overflow-hidden shadow-2xl">
        <div class="absolute -top-10 -right-10 w-32 h-32 bg-white rounded-full blur-3xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
        <div class="text-center pb-6 border-b border-white/20 z-10">
          <h3 class="text-2xl font-bold text-orange-100 tracking-wide">VIP 3</h3>
          <div class="mt-4 flex items-baseline justify-center gap-1">
            <span class="text-4xl font-extrabold text-white drop-shadow-md">Altın Paket</span>
          </div>
        </div>
        <div class="flex-1 z-10">
          <ul class="space-y-4">
            <li class="flex items-start gap-3">
              <span class="material-symbols-outlined text-white shrink-0">diamond</span>
              <span class="text-sm font-medium text-orange-50">Anında <strong class="text-white text-base">50.000 LT</strong> Hediye</span>
            </li>
            <li class="flex items-start gap-3">
              <span class="material-symbols-outlined text-white shrink-0">diamond</span>
              <span class="text-sm font-medium text-orange-50">Haftalık <strong class="text-white text-base">20.000 LT</strong> Maaş</span>
            </li>
            <li class="flex items-start gap-3">
              <span class="material-symbols-outlined text-white shrink-0">diamond</span>
              <span class="text-sm font-medium text-orange-50">Tüm VIP 1 ve VIP 2 Özellikleri</span>
            </li>
            <li class="flex items-start gap-3">
              <span class="material-symbols-outlined text-white shrink-0">diamond</span>
              <span class="text-sm font-medium text-orange-50">Sınırsız Oda Oluşturma Hakkı</span>
            </li>
            <li class="flex items-start gap-3">
              <span class="material-symbols-outlined text-white shrink-0">diamond</span>
              <span class="text-sm font-medium text-orange-50">Özel Sunucu Giriş Önceliği</span>
            </li>
          </ul>
        </div>
        <div class="mt-6 flex flex-col gap-3 z-10">
          <p class="text-center text-xs text-orange-200 mb-1">Güvenli Satın Alım Noktaları:</p>
          <a href="#" target="_blank" class="w-full text-center px-4 py-3.5 bg-[#ff7300] hover:bg-[#e66800] text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 hover:-translate-y-1">
            ByNoGame ile Al
          </a>
          <a href="#" target="_blank" class="w-full text-center px-4 py-3.5 bg-[#1e40af] hover:bg-[#1e3a8a] text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 hover:-translate-y-1">
            Kopazar ile Al
          </a>
        </div>
      </div>

    </div>
  </main>
</body>
</html>"""

with open('views/vip.ejs', 'w', encoding='utf-8') as f:
    f.write(content)
