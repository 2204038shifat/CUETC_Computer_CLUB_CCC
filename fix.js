const fs = require('fs');
const path = require('path');
const files = fs.readdirSync('Frontend').filter(f => f.endsWith('.html')).map(f => path.join('Frontend', f));
files.forEach(f => {
    let content = fs.readFileSync(f, 'utf8');
    content = content.replace('<link rel=\"stylesheet\" href=\"css/style.css\">', '<link rel=\"stylesheet\" href=\"css/style.css\">\\n    <link rel=\"stylesheet\" href=\"css/responsive.css\">');
    fs.writeFileSync(f, content, 'utf8');
});
