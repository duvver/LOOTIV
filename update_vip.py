import re

with open('views/settings-profile.ejs', 'r', encoding='utf-8') as f:
    content = f.read()

# We want to replace everything from <% if (typeof activeVip !== 'undefined' && activeVip) { %> down to <% } %> before </div> <div class="mt-6">

# Since we want it to look "out of this world", we'll inject some custom CSS right before it
custom_css = '''
<style>
  .vip-universe {
    position: relative;
    border-radius: 1.5rem;
    overflow: hidden;
    padding: 2px;
    background: linear-gradient(45deg, #FFD700, #FF8C00, #8A2BE2, #4B0082);
    background-size: 400% 400%;
    animation: universeGlow 8s ease infinite;
    box-shadow: 0 0 30px rgba(138, 43, 226, 0.4), inset 0 0 20px rgba(0,0,0,0.5);
  }
  @keyframes universeGlow {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  .vip-universe-inner {
    background: rgba(15, 10, 28, 0.9);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-radius: 1.4rem;
    padding: 2rem;
    position: relative;
    z-index: 2;
    overflow: hidden;
  }
  .vip-universe-inner::before {
    content: '';
    position: absolute;
    top: -50%; left: -50%;
    width: 200%; height: 200%;
    background: radial-gradient(circle at center, rgba(138,43,226,0.15) 0%, transparent 60%);
    animation: spinSlow 30s linear infinite;
    z-index: -1;
    pointer-events: none;
  }
  @keyframes spinSlow {
    100% { transform: rotate(360deg); }
  }
  .vip-perk-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 1rem;
    padding: 1.25rem;
    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    position: relative;
    overflow: hidden;
  }
  .vip-perk-card:hover {
    transform: translateY(-5px) scale(1.02);
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 215, 0, 0.4);
    box-shadow: 0 10px 25px rgba(138, 43, 226, 0.3);
  }
  .vip-perk-icon-wrap {
    width: 3rem; height: 3rem;
    border-radius: 0.75rem;
    display: flex; align-items: center; justify-content: center;
    margin-bottom: 0.75rem;
    font-size: 1.5rem;
    background: linear-gradient(135deg, rgba(255,215,0,0.2), rgba(138,43,226,0.2));
    border: 1px solid rgba(255,215,0,0.3);
    box-shadow: inset 0 0 10px rgba(255,215,0,0.2);
  }
  .vip-text-gradient {
    background: linear-gradient(to right, #FFD700, #FFA500, #FF1493);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    font-weight: 900;
    letter-spacing: 1px;
  }
</style>
'''

vip_active = '''      <!-- VIP Aktif (YENI TASARIM) -->
      <div class="vip-universe lg:col-span-2">
        <div class="vip-universe-inner">
          
          <div class="flex items-center gap-4 mb-6">
            <div class="w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-purple-600 flex items-center justify-center p-1 shadow-[0_0_15px_rgba(255,215,0,0.5)]">
              <div class="w-full h-full bg-slate-900 rounded-full flex items-center justify-center text-3xl font-black text-amber-400">
                V<%= user.vip_tier %>
              </div>
            </div>
            <div>
              <h2 class="text-3xl font-black vip-text-gradient uppercase tracking-widest"><%= activeVip.label %></h2>
              <div class="flex items-center gap-2 mt-1">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase">Aktif</span>
                <span class="text-xs text-purple-300 font-medium tracking-wide">Bitiş: <%= new Date(user.vip_expire).toLocaleDateString('tr-TR') %></span>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 my-6">
            <div class="vip-perk-card group">
              <div class="vip-perk-icon-wrap text-amber-400 group-hover:text-white group-hover:bg-amber-500 transition-colors">
                <span class="material-symbols-outlined">forum</span>
              </div>
              <h4 class="font-bold text-white text-sm mb-1">Lobi PM</h4>
              <p class="text-[11px] text-purple-200/60 leading-relaxed">Oyuncularla 1-v-1 özel ve şifreli mesajlaşma ayrıcalığı.</p>
            </div>
            
            <div class="vip-perk-card group">
              <div class="vip-perk-icon-wrap text-emerald-400 group-hover:text-white group-hover:bg-emerald-500 transition-colors">
                <span class="material-symbols-outlined">account_balance_wallet</span>
              </div>
              <h4 class="font-bold text-white text-sm mb-1">Haftalık LT</h4>
              <p class="text-[11px] text-purple-200/60 leading-relaxed">Her hafta hesabınıza otomatik <strong class="text-emerald-400">+<%= activeVip.weekly %> LT</strong> yatırılır.</p>
            </div>

            <div class="vip-perk-card group">
              <div class="vip-perk-icon-wrap text-pink-400 group-hover:text-white group-hover:bg-pink-500 transition-colors">
                <span class="material-symbols-outlined">workspace_premium</span>
              </div>
              <h4 class="font-bold text-white text-sm mb-1">Özel Rozet</h4>
              <p class="text-[11px] text-purple-200/60 leading-relaxed">Tüm salonlarda isminizin yanında prestijli VIP rozeti görünür.</p>
            </div>

            <div class="vip-perk-card group">
              <div class="vip-perk-icon-wrap text-blue-400 group-hover:text-white group-hover:bg-blue-500 transition-colors">
                <span class="material-symbols-outlined">card_giftcard</span>
              </div>
              <h4 class="font-bold text-white text-sm mb-1">Anında Bonus</h4>
              <p class="text-[11px] text-purple-200/60 leading-relaxed">Aktivasyonda tek seferlik <strong class="text-blue-400">+<%= activeVip.instant %> LT</strong> kazandınız.</p>
            </div>
          </div>

          <div class="pt-5 flex flex-col md:flex-row items-center justify-between gap-4 relative z-10 border-t border-white/10">
            <div>
              <h4 class="font-bold text-white text-sm tracking-wide">Süreyi Uzat veya Yükselt</h4>
              <p class="text-xs text-purple-300/70 mt-1">E-Pin kodunuzu girerek deneyiminizi kesintisiz sürdürün.</p>
            </div>
            <form method="POST" action="/settings/profile/vip" class="flex gap-2 w-full md:w-auto">
              <input name="vip_code" placeholder="VIP KODU..." required class="px-4 py-2.5 bg-slate-900/50 border border-purple-500/30 rounded-lg text-amber-400 font-bold placeholder-purple-400/30 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 uppercase text-sm w-full md:w-56 tracking-wider shadow-inner" />
              <button class="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-black font-black rounded-lg text-xs hover:scale-105 transition-transform uppercase tracking-widest shadow-[0_0_15px_rgba(255,165,0,0.5)]">Onayla</button>
            </form>
          </div>
        </div>
      </div>
'''

vip_inactive = '''      <!-- VIP Aktif Degil (YENI TASARIM) -->
      <div class="vip-universe lg:col-span-2 filter grayscale-[0.2] hover:grayscale-0 transition-all duration-700">
        <div class="vip-universe-inner">
          
          <div class="flex items-center gap-4 mb-6">
            <div class="w-16 h-16 rounded-full bg-slate-800/80 border-2 border-purple-500/30 flex items-center justify-center p-1 shadow-[0_0_15px_rgba(138,43,226,0.3)]">
              <span class="material-symbols-outlined text-3xl text-purple-400">diamond</span>
            </div>
            <div>
              <h2 class="text-3xl font-black text-white uppercase tracking-widest">VIP Deneyimi</h2>
              <div class="flex items-center gap-2 mt-1">
                <span class="text-xs text-purple-300 font-medium tracking-wide">Lootiv evreninin ayrıcalıklı dünyasına adım atın.</span>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 my-6">
            <div class="vip-perk-card group">
              <div class="vip-perk-icon-wrap text-amber-400 group-hover:text-white group-hover:bg-amber-500 transition-colors">
                <span class="material-symbols-outlined">forum</span>
              </div>
              <h4 class="font-bold text-white text-sm mb-1">Özel PM Alanı</h4>
              <p class="text-[11px] text-purple-200/60 leading-relaxed">Oyuncularla 1-v-1 şifreli mesajlaşma.</p>
            </div>
            
            <div class="vip-perk-card group">
              <div class="vip-perk-icon-wrap text-emerald-400 group-hover:text-white group-hover:bg-emerald-500 transition-colors">
                <span class="material-symbols-outlined">account_balance_wallet</span>
              </div>
              <h4 class="font-bold text-white text-sm mb-1">Maaş Sistemi</h4>
              <p class="text-[11px] text-purple-200/60 leading-relaxed">Her hafta hesabınıza otomatik LT yatırılır.</p>
            </div>

            <div class="vip-perk-card group">
              <div class="vip-perk-icon-wrap text-pink-400 group-hover:text-white group-hover:bg-pink-500 transition-colors">
                <span class="material-symbols-outlined">workspace_premium</span>
              </div>
              <h4 class="font-bold text-white text-sm mb-1">Prestij</h4>
              <p class="text-[11px] text-purple-200/60 leading-relaxed">İsminizin yanındaki VIP tagı ile saygı uyandırın.</p>
            </div>
          </div>

          <div class="pt-5 flex flex-col md:flex-row items-center justify-between gap-4 relative z-10 border-t border-white/10">
            <div>
              <h4 class="font-bold text-white text-sm tracking-wide">VIP Statüsünü Başlat</h4>
              <p class="text-xs text-purple-300/70 mt-1">ByNoGame veya Kopazar E-Pin kodunuzu girerek evrene katılın.</p>
            </div>
            <form method="POST" action="/settings/profile/vip" class="flex gap-2 w-full md:w-auto">
              <input name="vip_code" placeholder="VIP E-PIN KODU" required class="px-4 py-2.5 bg-slate-900/50 border border-purple-500/30 rounded-lg text-amber-400 font-bold placeholder-purple-400/30 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 uppercase text-sm w-full md:w-56 tracking-wider shadow-inner" />
              <button class="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black rounded-lg text-xs hover:scale-105 transition-transform uppercase tracking-widest shadow-[0_0_15px_rgba(138,43,226,0.5)]">Aktifleştir</button>
            </form>
          </div>
        </div>
      </div>
'''

new_vip_block = f"""
{custom_css}
      <% if (typeof activeVip !== 'undefined' && activeVip) {{ %>
{vip_active}
      <% }} else {{ %>
{vip_inactive}
      <% }} %>
"""

# Regex substitution to replace old VIP block
content = re.sub(r"<% if \(typeof activeVip !== 'undefined' && activeVip\) \{ %>[\s\S]*?<% } %>", new_vip_block.strip(), content, count=1)

with open('views/settings-profile.ejs', 'w', encoding='utf-8') as f:
    f.write(content)
