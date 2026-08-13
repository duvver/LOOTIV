import re

with open('views/settings-profile.ejs', 'r', encoding='utf-8') as f:
    content = f.read()

new_non_vip = '''<% } else { %>
          <!-- VIP Aktifleştirme ve Tanıtım Kartı (VIP Olmayan Kullanıcılar İçin) -->
          <div class="bg-gradient-to-br from-slate-900 via-purple-950 to-slate-950 text-white rounded-2xl border border-purple-500/30 shadow-xl p-6 lg:col-span-2 relative overflow-hidden">
            
            <!-- Arka Plan Glow Efektleri -->
            <div class="absolute -right-10 -bottom-10 w-64 h-64 bg-purple-600/10 rounded-full blur-3xl pointer-events-none"></div>
            <div class="absolute -left-10 -top-10 w-48 h-48 bg-amber-500/10 rounded-full blur-2xl pointer-events-none"></div>
            
            <div class="flex items-center gap-4 mb-6 relative z-10">
              <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-800 to-purple-950 border border-purple-500/30 flex items-center justify-center text-3xl shadow-lg">
                💎
              </div>
              <div>
                <h2 class="text-xl font-bold text-white tracking-wide">VIP Üyelik & Ayrıcalıklar</h2>
                <p class="text-sm text-purple-200/70 mt-1">LOOTIV dünyasında ayrıcalıklı üye olarak özel imkanlardan yararlanın.</p>
              </div>
            </div>
  
            <!-- VIP Avantajları Özeti -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 my-6 relative z-10">
              <div class="p-5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors group">
                <span class="material-symbols-outlined text-purple-400 text-3xl mb-3 group-hover:scale-110 transition-transform">forum</span>
                <span class="font-bold text-white block text-sm mb-1">Lobi Özel Mesaj</span>
                <span class="text-purple-200/60 text-xs">Diğer oyuncularla 1-v-1 özel mesajlaşma</span>
              </div>
              <div class="p-5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors group">
                <span class="material-symbols-outlined text-amber-400 text-3xl mb-3 group-hover:scale-110 transition-transform">account_balance_wallet</span>
                <span class="font-bold text-white block text-sm mb-1">Haftalık LT Maaş</span>
                <span class="text-purple-200/60 text-xs">Her hafta düzenli otomatik LT yüklemesi</span>
              </div>
              <div class="p-5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors group">
                <span class="material-symbols-outlined text-purple-400 text-3xl mb-3 group-hover:scale-110 transition-transform">workspace_premium</span>
                <span class="font-bold text-white block text-sm mb-1">Özel VIP Rozeti</span>
                <span class="text-purple-200/60 text-xs">Tüm masalarda & sohbetlerde seçkin görünüm</span>
              </div>
            </div>
  
            <div class="mt-2 flex justify-end relative z-10">
              <a href="/market" class="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-purple-500/30 flex items-center gap-2 transition-all hover:scale-105">
                <span class="material-symbols-outlined text-sm">shopping_cart</span> VIP Paketlerini İncele
              </a>
            </div>
          </div>
'''

pattern = re.compile(r'<% } else { %>\s*<!-- VIP Aktifle.*?<% } %>', re.DOTALL)
new_content = pattern.sub(new_non_vip + "<% } %>", content)

with open('views/settings-profile.ejs', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Replacement done!")
