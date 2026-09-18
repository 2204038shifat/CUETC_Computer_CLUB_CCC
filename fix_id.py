import glob
for f in glob.glob('Frontend/*.html'):
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    content = content.replace('<ul class=\"nav-links\">', '<ul class=\"nav-links\" id=\"nav-links\">')
    with open(f, 'w', encoding='utf-8') as file:
        file.write(content)

