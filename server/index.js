const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');

const PORT = 3000;
const MC_DIR = '/data/.openclaw/mission-control-v2';
const WEBHOOK_SECRET = 'braini-webhook-2026';

const tasksPath = path.join(MC_DIR, 'tasks.json');
const projectsPath = path.join(MC_DIR, 'projects.json');

// Read OpenClaw data
function readOpenClawData() {
  const data = {
    cron: [],
    sessions: [],
    memory: []
  };
  
  try {
    // Read cron jobs
    if (fs.existsSync('/data/.openclaw/cron/jobs.json')) {
      const cronData = JSON.parse(fs.readFileSync('/data/.openclaw/cron/jobs.json', 'utf8'));
      data.cron = cronData.jobs || [];
    }
    
    // Read session metadata
    if (fs.existsSync('/data/.openclaw/agents/main/sessions/sessions.json')) {
      const sessionsData = JSON.parse(fs.readFileSync('/data/.openclaw/agents/main/sessions/sessions.json', 'utf8'));
      data.sessions = sessionsData.sessions || [];
      
      // Add session count stats
      data.activeSessions = data.sessions.filter(s => s.active).length;
      data.totalSessions = data.sessions.length;
    }
    
    // Count memory files
    if (fs.existsSync('/data/.openclaw/memory/')) {
      const memoryFiles = fs.readdirSync('/data/.openclaw/memory/').filter(f => f.endsWith('.md'));
      data.memoryFiles = memoryFiles.length;
      
      // Get recent memory files
      data.recentMemory = memoryFiles.slice(-5).map(f => ({
        name: f,
        path: `/data/.openclaw/memory/${f}`,
        modified: fs.statSync(path.join('/data/.openclaw/memory/', f)).mtime
      }));
    }
    
    // Get system status
    try {
      const status = execSync('openclaw status', { encoding: 'utf8' });
      data.openclawStatus = status;
    } catch (e) {
      data.openclawStatus = 'Unable to get status';
    }
    
  } catch (err) {
    console.error('Error reading OpenClaw data:', err.message);
  }
  
  return data;
}

function handleApi(req, res) {
  const url = req.url.replace('/api', '');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (url === '/status') {
    res.end(JSON.stringify({ 
      status: 'ok', 
      time: new Date().toISOString(),
      ...readOpenClawData()
    }));
    return;
  }

  if (url === '/tasks') {
    let tasks = [];
    if (fs.existsSync(tasksPath)) {
      tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
    }
    res.end(JSON.stringify({ tasks }));
    return;
  }

  if (url === '/projects') {
    let projects = [];
    if (fs.existsSync(projectsPath)) {
      projects = JSON.parse(fs.readFileSync(projectsPath, 'utf8'));
    }
    res.end(JSON.stringify({ projects }));
    return;
  }

  if (url === '/add-task' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const task = JSON.parse(body);
        let tasks = [];
        if (fs.existsSync(tasksPath)) {
          tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
        }
        task.id = Date.now().toString();
        task.created = new Date().toISOString();
        task.status = task.status || 'backlog';
        tasks.push(task);
        fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2));
        res.end(JSON.stringify({ success: true, task }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (url.startsWith('/tasks/') && req.method === 'PUT') {
    const taskId = url.split('/')[2];
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const update = JSON.parse(body);
        let tasks = [];
        if (fs.existsSync(tasksPath)) {
          tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
        }
        const idx = tasks.findIndex(t => t.id === taskId);
        if (idx !== -1) {
          tasks[idx] = { ...tasks[idx], ...update };
          fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2));
          res.end(JSON.stringify({ success: true, task: tasks[idx] }));
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Task not found' }));
        }
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Unknown endpoint' }));
}

function handleWebhook(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      // Verify GitHub signature
      const sig = req.headers['x-hub-signature-256'];
      if (!sig) {
        res.writeHead(401);
        res.end('No signature');
        return;
      }
      
      const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
      const digest = 'sha256=' + hmac.update(body).digest('hex');
      
      if (sig !== digest) {
        res.writeHead(401);
        res.end('Invalid signature');
        return;
      }

      console.log('Webhook received, deploying...');
      execSync('cd ' + MC_DIR + ' && git pull origin main');
      
      res.writeHead(200);
      res.end('Deployed! Server will restart.');
      
      setTimeout(() => {
        spawn('node', ['server/index.js'], {
          cwd: MC_DIR,
          detached: true,
          stdio: 'ignore'
        });
        process.exit(0);
      }, 500);
    } catch (e) {
      console.error(e);
      res.writeHead(500);
      res.end(e.message);
    }
  });
}

function serveStatic(req, res) {
  let url = req.url;
  if (url.startsWith('/custom-mission-control')) {
    url = url.replace('/custom-mission-control', '') || '/';
  }
  
  const filePath = path.join(MC_DIR, 'public', url === '/' ? 'index.html' : url);
  const ext = path.extname(filePath);
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
  };
  
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (ext === '') {
        fs.readFile(path.join(MC_DIR, 'public', 'index.html'), (e, d) => {
          if (e) {
            res.writeHead(404);
            res.end('Not found');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(d);
          }
        });
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    } else {
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
      res.end(data);
    }
  });
}

const server = http.createServer((req, res) => {
  // Handle webhook
  if (req.url === '/webhook' && req.method === 'POST') {
    handleWebhook(req, res);
    return;
  }
  
  // Handle API
  if (req.url.startsWith('/api')) {
    handleApi(req, res);
    return;
  }
  
  // Serve static files
  serveStatic(req, res);
});

server.listen(PORT, '0.0.0.0', () => console.log('Mission Control v2.1 on port ' + PORT));