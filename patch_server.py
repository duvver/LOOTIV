import re

with open(r'server.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Add socket.on('okey101:undoDraw')
undo_socket = """
    socket.on('okey101:undoDraw', () => {
      const result = okey101Table.handleUndoDraw(socket.user.id);
      if (result && result.error) socket.emit('okey101:error', result.error);
    });
"""

if "okey101:undoDraw" not in content:
    content = content.replace("socket.on('okey101:draw', (source) => {", undo_socket + "\n    socket.on('okey101:draw', (source) => {")
    with open(r'server.js', 'w', encoding='utf-8') as out:
        out.write(content)
    print("server.js patched for undoDraw.")
else:
    print("server.js already has undoDraw.")
