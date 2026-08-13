with open('views/lobby.ejs', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('<button onclick="openVipModal()"', '<a href="/vip"')
content = content.replace('VIP Satın Al</span>\n          </button>', 'VIP Satın Al</span>\n          </a>')
content = content.replace('<button onclick="closePmModal(event); openVipModal();" class="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg font-label-md transition-colors shadow-sm w-full">VIP Satın Al</button>', '<a href="/vip" class="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg font-label-md transition-colors shadow-sm w-full block text-center">VIP Satın Al</a>')

with open('views/lobby.ejs', 'w', encoding='utf-8') as f:
    f.write(content)
