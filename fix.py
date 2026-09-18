import glob
for f in glob.glob('Frontend/*.html'):
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    content = content.replace('<link rel=\"stylesheet\" href=\"css/style.css\">', '<link rel=\"stylesheet\" href=\"css/style.css\">\n    <link rel=\"stylesheet\" href=\"css/responsive.css\">')
    with open(f, 'w', encoding='utf-8') as file:
        file.write(content)

