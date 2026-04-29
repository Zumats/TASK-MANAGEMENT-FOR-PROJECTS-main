
const fs = require('fs');
const content = fs.readFileSync('c:/Users/Uriel/Downloads/task-management1-master/task-management1-master/web/src/app/app/page.tsx', 'utf8');

const lines = content.split('\n');
let stack = [];
let hasError = false;

lines.forEach((line, i) => {
    if (hasError) return;
    
    // Very simple tag extraction
    // This doesn't handle strings with tags but usually files are clean enough
    const tags = line.match(/<div(?:\s+[^>]*)?>|<\/div>|<Card(?:\s+[^>]*)?>|<\/Card>|<>|<\/>/g) || [];
    
    tags.forEach(tag => {
        if (hasError) return;
        
        if (tag.startsWith('</')) {
            const tagName = tag.match(/<\/([^>]+)>/)[1];
            if (stack.length === 0) {
                console.log(`ERROR: Extra closing tag ${tag} at line ${i + 1}`);
                hasError = true;
            } else {
                const last = stack.pop();
                if (last.tag !== tagName && !(tagName === '' && last.tag === '')) {
                    // special check for fragment
                    if (tagName === '' && last.tag !== '') {
                         console.log(`ERROR: Closing fragment </> at line ${i + 1}, but opened <${last.tag}> at line ${last.line}`);
                         hasError = true;
                    } else if (tagName !== '' && last.tag === '') {
                         console.log(`ERROR: Closing </${tagName}> at line ${i + 1}, but opened fragment <> at line ${last.line}`);
                         hasError = true;
                    } else {
                         console.log(`ERROR: Mismatched tag </${tagName}> at line ${i + 1}, expected </${last.tag || 'fragment'}> (opened at line ${last.line})`);
                         hasError = true;
                    }
                }
            }
        } else if (tag === '<>') {
            stack.push({ tag: '', line: i + 1 });
        } else {
            const tagName = tag.match(/<([^\s>]+)/)[1];
            stack.push({ tag: tagName, line: i + 1 });
        }
    });
});

if (!hasError && stack.length > 0) {
    console.log('Unclosed tags:');
    stack.forEach(t => console.log(`  <${t.tag || 'fragment'}> opened at line ${t.line}`));
} else if (!hasError) {
    console.log('All divs, Cards and Fragments are balanced.');
}
