const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const MC_DIR = '/data/.openclaw/mission-control';

const tasksPath = path.join(MC_DIR, 'tasks.json');
const projectsPath = path.join(MC_DIR, 'projects.json');

function handleApi(req, res) {
  const url = req.url.replace('/api', '');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  if (url === '/status') {
    res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString() }));
    return;
  }

  if (url === '/tasks') {
    const tasks = fs.existsSync(tasksPath) ? JSON.parse(fs.readFileSync(tasksPath, 'utf8')) : [];
    res.end(JSON.stringify({tasks}));
    return;
  }

  if (url === '/projects') {
    const projects = fs.existsSync(projectsPath) ? JSON.parse(fs.readFileSync(projectsPath, 'utf8')) : [];
    res.end(JSON.stringify({projects}));
    return;
  }

  res.end(JSON.stringify({error: 'Unknown endpoint'}));
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api')) { handleApi(req, res); return; }
  
  let url = req.url;
  if (url.startsWith('/custom-mission-control')) {
    url = url.replace('/custom-mission-control', '') || '/';
  }
  
  const filePath = path.join(MC_DIR, 'public', url === '/' ? 'index.html' : url);
  
  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(MC_DIR, 'public', 'index.html'), (e, d) => {
        if (e) { res.writeHead(404); res.end('Not found'); }
        else { res.writeHead(200, {'Content-Type': 'text/html'}); res.end(d); }
      });
    } else {
      const ext = path.extname(filePath);
      const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css'};
      res.writeHead(200, {'Content-Type': types[ext] || 'text/plain'});
      res.end(data);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => console.log('Mission Control v2 on port ' + PORT));