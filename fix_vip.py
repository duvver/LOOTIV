import re

with open('views/settings-profile.ejs', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the white container with a purple one
# From: class="p-4 sm:p-6 bg-white border-t border-outline-variant"
# To: class="p-4 sm:p-6 bg-gradient-to-br from-[#2D1B4E] to-[#1a0f2e] text-white rounded-b-xl border-t border-purple-800/30"
content = re.sub(r'class="p-4 sm:p-6 bg-white border-t border-outline-variant"', 'class="p-4 sm:p-6 bg-gradient-to-br from-[#2D1B4E] to-[#1a0f2e] text-white border-t border-purple-800/30"', content)

# Replace <h2 class="font-headline-md text-headline-md text-primary">VIP Üyelik & Ayrıcalıklar</h2>
# with text-white
content = re.sub(r'class="font-headline-md text-headline-md text-primary"(.*?>VIP)', r'class="font-headline-md text-headline-md text-white"\1', content)

# Replace <p class="text-body-sm text-on-surface-variant"> with text-purple-200
content = re.sub(r'class="text-body-sm text-on-surface-variant"(.*?>LOOTIV dünyasında)', r'class="text-body-sm text-purple-200"\1', content)

# Replace <div class="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20 flex items-center gap-3">
# with a translucent purple box
content = re.sub(r'class="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20 flex items-center gap-3"', r'class="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center gap-3"', content)

# Replace <span class="font-bold text-primary block text-sm"> with text-white
content = re.sub(r'class="font-bold text-primary block text-sm"', r'class="font-bold text-white block text-sm"', content)

# Replace <span class="text-xs text-on-surface-variant"> with text-purple-300
content = re.sub(r'class="text-xs text-on-surface-variant"', r'class="text-xs text-purple-300"', content)

with open('views/settings-profile.ejs', 'w', encoding='utf-8') as f:
    f.write(content)
