const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const DIR = '/data/.openclaw';

const MC_DIR = path.join(DIR, 'mission-control');
if (!fs.existsSync(MC_DIR)) {
  fs.mkdirSync(MC_DIR, {recursive: true});
}

const tasksPath = path.join(MC_DIR, 'tasks.json');
const projectsPath = path.join(MC_DIR, 'projects.json');

if (!fs.existsSync(tasksPath)) {
  fs.writeFileSync(tasksPath, JSON.stringify([
    {id: 1, title: 'Set up OpenClaw on Hostinger', status: 'done', assignee: 'user', priority: 'high', createdAt: '2026-03-01'},
    {id: 2, title: 'Configure Telegram channel', status: 'done', assignee: 'user', priority: 'high', createdAt: '2026-03-01'},
    {id: 3, title: 'Set up OpenRouter for cost optimization', status: 'done', assignee: 'user', priority: 'high', createdAt: '2026-03-04'},
    {id: 4, title: 'Build Mission Control dashboard', status: 'in-progress', assignee: 'henry', priority: 'high', createdAt: '2026-03-04'},
    {id: 5, title: 'Enable web search & YouTube', status: 'backlog', assignee: 'henry', priority: 'medium', createdAt: '2026-03-04'},
    {id: 6, title: 'Set up cron jobs for automation', status: 'backlog', assignee: 'user', priority: 'medium', createdAt: '2026-03-04'},
  ], null, 2));
}

if (!fs.existsSync(projectsPath)) {
  fs.writeFileSync(projectsPath, JSON.stringify([
    {id: 1, name: 'OpenClaw Setup', description: 'Complete OpenClaw deployment', progress: 90, status: 'active'},
    {id: 2, name: 'Cost Optimization', description: 'Reduce API costs with OpenRouter', progress: 80, status: 'active'},
    {id: 3, name: 'Mission Control', description: 'Build custom dashboard', progress: 40, status: 'active'},
  ], null, 2));
}

function handleApi(req, res) {
  const url = req.url.replace('/api', '');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  if (url === '/status') {
    const sessionsDir = path.join(DIR, 'agents/main/sessions');
    let sessionCount = 0, totalSize = 0;
    try {
      const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'));
      sessionCount = files.length;
      files.forEach(f => { totalSize += fs.statSync(path.join(sessionsDir, f)).size; });
    } catch(e) {}
    res.end(JSON.stringify({ sessions: sessionCount, sessionSize: (totalSize/1024/1024).toFixed(2)+' MB', uptime: Math.floor(process.uptime()) }));
    return;
  }

  if (url === '/tasks') {
    const tasks = fs.existsSync(tasksPath) ? JSON.parse(fs.readFileSync(tasksPath, 'utf8')) : [];
    res.end(JSON.stringify({tasks}));
    return;
  }

  if (url.startsWith('/tasks') && req.method === 'POST') {
    let body = ''; req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const newTask = JSON.parse(body);
        const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
        newTask.id = Date.now(); newTask.createdAt = new Date().toISOString();
        tasks.push(newTask);
        fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2));
        res.end(JSON.stringify({success: true, task: newTask}));
      } catch(e) { res.end(JSON.stringify({success: false, error: e.message})); }
    });
    return;
  }

  if (url.startsWith('/tasks/') && req.method === 'PUT') {
    const taskId = parseInt(url.split('/')[2]);
    let body = ''; req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const update = JSON.parse(body);
        const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
        const idx = tasks.findIndex(t => t.id === taskId);
        if (idx >= 0) { tasks[idx] = {...tasks[idx], ...update}; fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2)); res.end(JSON.stringify({success: true})); }
        else res.end(JSON.stringify({success: false, error: 'Not found'}));
      } catch(e) { res.end(JSON.stringify({success: false, error: e.message})); }
    });
    return;
  }

  if (url.startsWith('/tasks/') && req.method === 'DELETE') {
    const taskId = parseInt(url.split('/')[2]);
    try {
      let tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
      tasks = tasks.filter(t => t.id !== taskId);
      fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2));
      res.end(JSON.stringify({success: true}));
    } catch(e) { res.end(JSON.stringify({success: false, error: e.message})); }
    return;
  }

  if (url === '/projects') {
    const projects = fs.existsSync(projectsPath) ? JSON.parse(fs.readFileSync(projectsPath, 'utf8')) : [];
    res.end(JSON.stringify({projects}));
    return;
  }

  if (url.startsWith('/projects') && req.method === 'POST') {
    let body = ''; req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const newProject = JSON.parse(body);
        const projects = JSON.parse(fs.readFileSync(projectsPath, 'utf8'));
        newProject.id = Date.now(); newProject.createdAt = new Date().toISOString();
        projects.push(newProject);
        fs.writeFileSync(projectsPath, JSON.stringify(projects, null, 2));
        res.end(JSON.stringify({success: true, project: newProject}));
      } catch(e) { res.end(JSON.stringify({success: false, error: e.message})); }
    });
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
  
  const filePath = path.join(__dirname, 'public', url === '/' ? 'index.html' : url);
  
  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(__dirname, 'public', 'index.html'), (e, d) => {
        if (e) { res.writeHead(404); res.end('Not found'); }
        else { res.writeHead(200, {'Content-Type': 'text/html'}); res.end(d); }
      });
    } else {
      const ext = path.extname(filePath);
      const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml'};
      res.writeHead(200, {'Content-Type': types[ext] || 'text/plain'});
      res.end(data);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => console.log('Mission Control v2 running on port ' + PORT));