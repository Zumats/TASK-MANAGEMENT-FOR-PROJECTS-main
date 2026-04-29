const fs = require('fs');
const glob = require('glob');

const files = glob.sync('src/app/api/**/*.ts', { cwd: __dirname });

for (const f of files) {
  let content = fs.readFileSync(f, 'utf8');
  let changed = false;

  // Replace `user` variant
  const r1 = /let user(?:|:[^;]+);\s*try\s*\{\s*user\s*=\s*requireUser\(req\);\s*\}\s*catch\s*\{\s*return\s+NextResponse\.json\(\{\s*error:\s*["']Unauthorized["']\s*\},\s*\{\s*status:\s*401\s*\}\);\s*\}/g;
  if (r1.test(content)) {
    content = content.replace(r1, 'let user = requireUser(req);\n  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });');
    changed = true;
  }
  
  // Replace `const user` variant (if declared inside try)
  const r2 = /try\s*\{\s*const\s*user\s*=\s*requireUser\(req\);\s*\}\s*catch\s*\{\s*return\s+NextResponse\.json\(\{\s*error:\s*["']Unauthorized["']\s*\},\s*\{\s*status:\s*401\s*\}\);\s*\}/g;
  if (r2.test(content)) {
    content = content.replace(r2, 'const user = requireUser(req);\n  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });');
    changed = true;
  }

  // Replace `const u` variant
  const r3 = /let [a-zA-Z0-9_]+(?:|:[^;]+);\s*try\s*\{\s*const\s*u\s*=\s*requireUser\(req\);\s*(?:userId|userRole)\s*=\s*u!\.[a-zA-Z0-9_]+;\s*\}\s*catch\s*\{\s*return\s+NextResponse\.json\(\{\s*error:\s*["']Unauthorized["']\s*\},\s*\{\s*status:\s*401\s*\}\);\s*\}/g;
  if(r3.test(content)){
    // Because I need to keep userId/userRole, I should just do a manual replace for the specific 'const u = requireUser' instances.
  }

  // A more generic block replace:
  const r4 = /try\s*\{\s*(?:const|let)?\s*([a-zA-Z0-9_]+)\s*=\s*requireUser\(req\);([\s\S]*?)\}\s*catch\s*\{\s*return\s+NextResponse\.json\(\{\s*error:\s*["']Unauthorized["']\s*\},\s*\{\s*status:\s*401\s*\}\);\s*\}/g;
  
  if (r4.test(content)) {
    content = content.replace(r4, (match, varName, rest) => {
      return `const ${varName} = requireUser(req);\n  if (!${varName}) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });${rest}`;
    });
    // Need to clean up `let user;` if it was declared before.
    content = content.replace(/let\s+user(?:|:[^;]+);\s*const\s+user\s*=\s*requireUser\(req\);/g, 'const user = requireUser(req);');
    content = content.replace(/let\s+userId(?:|:[^;]+);\s*const\s+u\s*=\s*requireUser\(req\);/g, 'const u = requireUser(req);');
    content = content.replace(/let\s+userRole(?:|:[^;]+);\s*const\s+u\s*=\s*requireUser\(req\);/g, 'const u = requireUser(req);');
    
    changed = true;
  }
  
  // also handle the single line `requireUser(req);` without assignment in api/comment-files
  content = content.replace(/requireUser\(req\);\n\s*const\s+db\s*=/g, 'const user = requireUser(req);\n  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });\n  const db =');

  if (changed) {
    fs.writeFileSync(f, content, 'utf8');
    console.log("Fixed", f);
  }
}
// Clean up one more edge case for comment-files/[id]/route.ts where it might lack the try-catch
