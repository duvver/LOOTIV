css_addition = """
.play-area {
  display: flex;
  flex-direction: row;
  gap: 15px;
  position: relative;
  align-items: center;
  justify-content: center;
  transform: scale(0.88);
}

.game-info-panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 15px;
  width: 140px;
}

.game-modes-panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
}
"""

with open(r'public\css\okey101.css', 'a', encoding='utf-8') as f:
    f.write(css_addition)
print("Added layout CSS successfully.")
