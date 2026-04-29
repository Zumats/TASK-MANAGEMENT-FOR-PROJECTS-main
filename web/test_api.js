const http = require('http');

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/auth/login',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
}, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    console.log("Login Res:", res.statusCode, body);
    try {
      const data = JSON.parse(body);
      const token = data.token;
      
      const req2 = http.request({
        hostname: 'localhost',
        port: 3000,
        path: '/api/tasks',
        method: 'GET',
        headers: {
          'Cookie': `tm_token=${token}`
        }
      }, res2 => {
        let body2 = '';
        res2.on('data', d => body2 += d);
        res2.on('end', () => {
          require('fs').writeFileSync('error.html', body2);
          console.log("Tasks Res:", res2.statusCode, "Wrote response to error.html");
        });
      });
      req2.end();
    } catch {}
  });
});

req.write(JSON.stringify({ email: 'admin@admin.com', password: 'admin123' }));
req.end();
