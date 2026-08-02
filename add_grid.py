css_addition = """
.grid-container {
  display: grid;
  grid-gap: 0px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: transparent;
}

.grid-26x13 {
  grid-template-columns: repeat(26, 24px);
  grid-template-rows: repeat(13, 30px);
}

.grid-6x13 {
  grid-template-columns: repeat(6, 24px);
  grid-template-rows: repeat(13, 30px);
}

.grid-5x13 {
  grid-template-columns: repeat(5, 24px);
  grid-template-rows: repeat(13, 30px);
}

.tile-slot {
  background: transparent;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  box-sizing: border-box;
}

.thick-divider {
  border-right: 2px solid rgba(255, 255, 255, 0.3);
}
"""

with open(r'public\css\okey101.css', 'a', encoding='utf-8') as f:
    f.write(css_addition)
print("Added grid CSS successfully.")
