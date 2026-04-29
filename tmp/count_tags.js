
const fs = require('fs');
const content = fs.readFileSync('c:/Users/Uriel/Downloads/task-management1-master/task-management1-master/web/src/app/app/page.tsx', 'utf8');

function countTags(tagName) {
    const openRegex = new RegExp('<' + tagName + '(?:\\s+[^>]*)?>', 'g');
    const closeRegex = new RegExp('</' + tagName + '>', 'g');
    const openMatches = content.match(openRegex) || [];
    const closeMatches = content.match(closeRegex) || [];
    return { open: openMatches.length, close: closeMatches.length };
}

const divs = countTags('div');
const cards = countTags('Card');
const fragments = {
    open: (content.match(/<>/g) || []).length,
    close: (content.match(/<\/>/g) || []).length
};

console.log('Divs:', divs);
console.log('Cards:', cards);
console.log('Fragments:', fragments);

// Find approximate line of imbalance if possible
let stack = [];
const lines = content.split('\n');
lines.forEach((line, i) => {
    const tags = line.match(/<div|<\/div>|<Card|<\/Card>|<>|<\/>/g) || [];
    tags.forEach(tag => {
        if (tag.startsWith('</')) {
            const expected = tag.slice(2, -1);
            if (stack.length === 0) {
                console.log(`Extra closing tag ${tag} at line ${i + 1}`);
            } else {
                const last = stack.pop();
                if (last.tag !== expected) {
                    console.log(`Mismatched closing tag ${tag} at line ${i + 1}, expected </${last.tag}> (opened at line ${last.line})`);
                }
            }
        } else if (tag === '<>') {
            stack.push({ tag: '', line: i + 1 });
        } else if (tag === '</>') {
           if (stack.length === 0 || stack[stack.length-1].tag !== '') {
               console.log(`Extra closing fragment at line ${i + 1}`);
           } else {
               stack.pop();
           }
        } else {
            const tagName = tag.slice(1);
            stack.push({ tag: tagName, line: i + 1 });
        }
    });
});

if (stack.length > 0) {
    console.log('Unclosed tags at end of file:');
    stack.forEach(t => console.log(`  <${t.tag}> opened at line ${t.line}`));
}
