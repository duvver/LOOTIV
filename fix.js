const fs = require('fs');
let c = fs.readFileSync('views/lobby.ejs', 'utf8');
let lines = c.split('\n');
let idx = lines.findIndex(l => l.includes('VIP Satın Al'));
if(idx !== -1) {
  let content = `        </button>
      </div>

      <!-- Gorevler / Gunluk oduller (sadece giris yapmis) -->
      <% if (user) { %>
        <div class="col-span-12 md:col-span-4 flex flex-col gap-4">
          <div class="bg-primary/10 text-primary font-headline-sm text-center rounded-xl p-3 border border-primary/20 shadow-sm flex items-center justify-center gap-2">
            <span class="w-2.5 h-2.5 bg-success-green rounded-full animate-pulse"></span>
            Sitede <span class="global-online-count font-bold">...</span> aktif oyuncu var
          </div>
          <div class="bg-white rounded-xl shadow-sm border border-outline-variant p-4 flex flex-col justify-between flex-1 overflow-hidden" style="max-height: 250px; overflow-y: auto;">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-headline-md text-label-md text-primary flex items-center gap-2">
                <span class="material-symbols-outlined text-xl">task_alt</span> Günlük Görevler
              </h3>
            </div>
            
            <div class="flex flex-col gap-3 flex-1 overflow-y-auto pr-1">
              <% if (dailyTasks && dailyTasks.length > 0) { %>
                <% dailyTasks.forEach(task => { %>
                  <% 
                    let progress = task.progress || 0;
                    let isCompleted = task.is_completed || false;
                    let percent = Math.min(100, (progress / task.target_count) * 100);
                  %>
                  <div class="border border-outline-variant rounded-lg p-2 flex flex-col gap-1 <%= isCompleted ? 'bg-success-green/10' : '' %>">
                    <div class="flex justify-between items-center">
                      <span class="text-label-sm font-medium text-primary line-clamp-1" title="<%= task.title %>"><%= task.title %></span>
                      <span class="text-label-sm font-bold text-secondary"><%= task.reward_lt %> LT</span>
                    </div>
                    <div class="flex items-center justify-between text-xs text-outline">
                      <span><%= progress %> / <%= task.target_count %></span>
                      <% if (isCompleted) { %>
                        <span class="text-success-green material-symbols-outlined text-sm">check_circle</span>
                      <% } %>
                    </div>
                    <% if (!isCompleted) { %>
                      <div class="w-full bg-surface-container rounded-full h-1 mt-1">
                        <div class="bg-primary h-1 rounded-full" style="width: <%= percent %>%"></div>
                      </div>
                    <% } %>
                  </div>
                <% }) %>
              <% } else { %>
                <div class="text-center text-outline text-sm my-4">Şu an aktif görev yok.</div>
              <% } %>
            </div>
          </div>
        </div>
      <% } %>
    </section>

    <!-- ===== Populer Oyunlar (herkes gorur) ===== -->
    <section id="oyunlar">
      <div class="flex justify-between items-end mb-8">
        <div>
          <h2 class="font-headline-lg text-headline-lg text-primary">Popüler Oyunlar</h2>
          <p class="font-body-md text-body-md text-outline">Masaya otur, sohbet et, LT kazan.</p>
        </div>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-5 gap-6">
        <!-- 101 Okey (aktif) -->
        <a href="/oyun/okey101" class="game-card-hover bg-white rounded-xl overflow-hidden shadow-sm flex flex-col">
          <div class="relative h-48 group/img bg-primary-container">
            <img class="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuD3IRAWvK-mmHFBucdVV8OGEhScS0BOJ99qSDXdr_Nzm_waM-8xPrE9CP1fDpZZjyZFWb6Cjzg2nwYCs2V4xgC9EOIFxcxDe-UEkoOORCcb9BF54_p_yZ2gUivWPNynr7znJLFfT3eKdGsN8H11v6xKTMSpAV2WqnuB3K8bsmFd-YhJCjLC-nJhaYbsEzuXAc7ArGlf149Ac3U6TS6XePsaSfD5DYE0ScGf-S2gQAMsjM4gJc1tE4W7" alt="101 Okey" />
            <div class="absolute inset-0 bg-primary/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
              <span class="px-6 py-2 bg-secondary text-white rounded-full font-label-md text-label-md">Oyna</span>
            </div>
          </div>
          <div class="p-4">
            <h3 class="font-headline-md text-headline-md text-primary mb-1">101 Okey</h3>
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-success-green"></span>
              <span class="font-label-sm text-label-sm text-outline"><span class="game-online-count-okey101">...</span> Oyuncu Aktif</span>
            </div>
          </div>
        </a>

        <!-- Canak Okey (aktif) -->
        <a href="/oyun/okey" class="game-card-hover bg-white rounded-xl overflow-hidden shadow-sm flex flex-col">
          <div class="relative h-48 group/img bg-primary-container">
            <img class="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCUibdf8xrKOQOY4NOcs-qteEgQzDt0b5p4HNLPQUl1hc270TKSdKM_qN6zsGyd-vJv4Imn50YwfFw5glfM4kcjPeK7UApFaCqa0hd5JWZU0lZ_JPJWJ6Or_pD5xXR4keo1bgVdhqqc0m7wDXMC17x69SzZhqou9VQcd8krUKCpp3Bc57Czn1Mi8w97DrELGAKJD9qwH5_x_I9vKUKM4Tws1GSQGA7HOwsY0LAG6NQy3oGo2_hk_7Ny" alt="Canak Okey" />
            <div class="absolute inset-0 bg-primary/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
              <span class="px-6 py-2 bg-secondary text-white rounded-full font-label-md text-label-md">Oyna</span>
            </div>
          </div>
          <div class="p-4">
            <h3 class="font-headline-md text-headline-md text-primary mb-1">Çanak Okey</h3>
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-success-green"></span>
              <span class="font-label-sm text-label-sm text-outline"><span class="game-online-count-okey">...</span> Oyuncu Aktif</span>
            </div>
          </div>
        </a>

        <!-- Turk Pokeri (aktif) -->
        <a href="/oyun/poker" class="game-card-hover bg-white rounded-xl overflow-hidden shadow-sm flex flex-col">
          <div class="relative h-48 group/img bg-primary-container">
            <img class="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBvi8X7sIDnTAIHHxVuCDVevoAY51kJdmnWtYtuiRkT8yOSjr8RP9dDHm9JM9szJJosFjk0QZFgfS909RSgmh4EQqKhGM8MHEkqwXmda4Ivxi5Dzi44EDjlkwHlra4HWsP6WYfy-S0pkMSvwZ4fvSbwBrCmRtpsgNQdcEEP6kwHEQug3BdeewVVfJzhvqCXsRnjWnprXKvrN7d4tAtwUC_oI3ut2zWN2RmsFr-zaQ7xczc3ZIdxL_0z" alt="Turk Pokeri" />
            <div class="absolute inset-0 bg-primary/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
              <span class="px-6 py-2 bg-secondary text-white rounded-full font-label-md text-label-md">Oyna</span>
            </div>
          </div>
          <div class="p-4">
            <h3 class="font-headline-md text-headline-md text-primary mb-1">Türk Pokeri</h3>
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-success-green"></span>
              <span class="font-label-sm text-label-sm text-outline"><span class="game-online-count-poker">...</span> Oyuncu Aktif</span>
            </div>
          </div>
        </a>

        <!-- Tavla (yakinda) -->
        <div class="bg-white rounded-xl overflow-hidden shadow-sm flex flex-col opacity-70">
          <div class="relative h-48 grayscale">
            <img class="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAktesiC0-SshV64nmg72I7_7v0Z0wwnnvV0iwwMSLVN2JfF_AoojbkGH7cdPpTo3eo3vmhlJWHMwIMuIa1cnBPgrOQeFo7Z7ondxf_ycb7nJLIKJt8DCi9IIDjqnWSwRSw-Fera3qKd_fzP9DrNMIbg0pmdlYvMQsLExi36jOTADBDglAppDn6gljHc77dQIahCGR5ZY9UhVAivHDc_t9wLjE3p2lBMcX7t5K51XTlQmuJpGJe9M8X" alt="Tavla" />`;
  let newLines = content.split('\n');
  lines.splice(idx+1, 0, ...newLines);
  fs.writeFileSync('views/lobby.ejs', lines.join('\n'));
}
