import re

with open('views/lobby.ejs', 'r', encoding='utf-8') as f:
    content = f.read()

# The opening tag was correctly replaced to <a href="/vip".
# But the closing tag is still </button>. 
# Let's find this specific button and fix the closing tag.
# We'll use regex to fix it safely without worrying about the exact spacing or encoding of "Satın Al".

# Find the block starting with <a href="/vip" class="flex flex-col items-center gap-2 group hover:text-yellow-600 transition-colors focus:outline-none">
# And replace the first </button> after it with </a>
start_idx = content.find('<a href="/vip" class="flex flex-col items-center gap-2 group hover:text-yellow-600 transition-colors focus:outline-none">')
if start_idx != -1:
    end_idx = content.find('</button>', start_idx)
    if end_idx != -1:
        content = content[:end_idx] + '</a>' + content[end_idx+9:]
        with open('views/lobby.ejs', 'w', encoding='utf-8') as f:
            f.write(content)
        print("Fixed unclosed <a> tag in lobby.ejs")
    else:
        print("Could not find closing </button>")
else:
    print("Could not find opening <a> tag")
