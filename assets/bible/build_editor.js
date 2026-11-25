const fs = require('fs');
const path = require('path');

const baseDir = 'f:/k/assets/bible';
const langs = ['ar', 'cb', 'cop', 'gr', 'he', 'en', 'sy'];
let allBooksData = {};

langs.forEach(lang => {
    const langDir = path.join(baseDir, lang);
    if (!fs.existsSync(langDir)) return;
    
    const files = fs.readdirSync(langDir).filter(f => f.endsWith('.json'));
    files.forEach(file => {
        const bookName = file.replace('.json', '');
        const filePath = path.join(langDir, file);
        try {
            const raw = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(raw);
            if (!allBooksData[bookName]) allBooksData[bookName] = {};
            allBooksData[bookName][lang] = data;
        } catch(e) {
            console.error('Error reading', filePath, e.message);
        }
    });
});

const htmlTemplate = fs.readFileSync(path.join(baseDir, 'template.html'), 'utf8');
const finalHtml = htmlTemplate.replace('// __INJECT_DATA__', 'let allBooksData = ' + JSON.stringify(allBooksData) + ';');

fs.writeFileSync(path.join(baseDir, 'editor_preloaded.html'), finalHtml, 'utf8');
console.log('Successfully created standalone editor at f:/k/assets/bible/editor_preloaded.html');
