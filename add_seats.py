css_addition = """
.ok1-body .okey-seat-pos-1 { left: 4%; top: 50%; }
.ok1-body .okey-seat-pos-2 { left: 50%; top: 6%; }
.ok1-body .okey-seat-pos-3 { left: 96%; top: 50%; }
.ok1-body .okey-seat-pos-0 { left: 50%; top: 92%; }
"""
with open(r'public\css\okey101.css', 'a', encoding='utf-8') as f:
    f.write(css_addition)
print("Added seat overrides.")
