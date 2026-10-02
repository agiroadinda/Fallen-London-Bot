import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { readdir } from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT      = 3000;

let botProcess  = null;
let botLogs     = [];
let sseClients  = [];


function broadcast(line) {
  botLogs.push(line);
  if (botLogs.length > 500) botLogs.shift();
  sseClients.forEach(res => res.write(`data: ${JSON.stringify(line)}\n\n`));
}


function startBot(taskPath) {
  if (botProcess) {
    broadcast({ type: 'warn', text: 'Bot is already running' });
    return false;
  }

  botLogs = [];
  broadcast({ type: 'info', text: `Starting bot with task: ${taskPath}` });

  botProcess = spawn('node', ['src/index.js', taskPath], {
    cwd:   __dirname,
    shell: true,
  });

  botProcess.stdout.on('data', data => {
    data.toString().split('\n').filter(Boolean).forEach(line => {
      broadcast({ type: 'log', text: line });
    });
  });

  botProcess.stderr.on('data', data => {
    data.toString().split('\n').filter(Boolean).forEach(line => {
      broadcast({ type: 'error', text: line });
    });
  });

  botProcess.on('close', code => {
    broadcast({ type: 'info', text: `Bot process exited (code ${code})` });
    broadcast({ type: 'stopped', text: 'Bot stopped' });
    botProcess = null;
  });

  return true;
}


function stopBot() {
  if (!botProcess) {
    broadcast({ type: 'warn', text: 'Bot is not running' });
    return false;
  }

  botProcess.kill('SIGINT');
  broadcast({ type: 'warn', text: 'Stop signal sent...' });
  return true;
}


function saveTask(name, json) {
  const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const fileName = `${safeName}.json`;
  const filePath = path.join(__dirname, 'src', 'tasks', fileName);
  fs.writeFileSync(filePath, JSON.stringify(json, null, 2));
  return { fileName, filePath };
}


async function listTasks() {
  const dir = path.join(__dirname, 'src', 'tasks');
  try {
    const files = await readdir(dir);
    return files.filter(f => f.endsWith('.json'));
  } catch {
    return [];
  }
}


const server = http.createServer(async (req, res) => {
  const url    = new URL(req.url, `http://localhost:${PORT}`);
  const method = req.method;

  
  if (method === 'GET' && url.pathname === '/') {
    const html = fs.readFileSync(path.join(__dirname, 'task-builder.html'));
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  
  if (method === 'GET' && url.pathname === '/logs') {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

  
    botLogs.forEach(log => res.write(`data: ${JSON.stringify(log)}\n\n`));

    
    res.write(`data: ${JSON.stringify({ type: 'status', running: !!botProcess })}\n\n`);

    sseClients.push(res);
    req.on('close', () => {
      sseClients = sseClients.filter(c => c !== res);
    });
    return;
  }

  
  if (method === 'GET' && url.pathname === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ running: !!botProcess }));
    return;
  }

  
  if (method === 'GET' && url.pathname === '/tasks') {
    const tasks = await listTasks();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tasks }));
    return;
  }

  
  if (method === 'GET' && url.pathname.startsWith('/tasks/') && url.pathname !== '/tasks') {
    const fileName = url.pathname.replace('/tasks/', '');
    const filePath = path.join(__dirname, 'src', 'tasks', fileName);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
    return;
  }

  if (method === 'POST' && url.pathname === '/tasks/delete') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { fileName } = JSON.parse(body);
        const filePath = path.join(__dirname, 'src', 'tasks', fileName);
        fs.unlinkSync(filePath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }



  if (method === 'POST' && url.pathname === '/tasks/save') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { name, task } = JSON.parse(body);
        const { fileName } = saveTask(name, task);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, fileName }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Start bot
  if (method === 'POST' && url.pathname === '/bot/start') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { taskFile } = JSON.parse(body);
        const taskPath = path.join('src', 'tasks', taskFile);
        const started  = startBot(taskPath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: started }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }


  if (method === 'GET' && url.pathname === '/cards') {
    const filePath = path.join(__dirname, 'src', 'cards', 'card-database.json');
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(content);
    } catch {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ cards: [] }));
    }
    return;
  }

  if (method === 'POST' && url.pathname === '/cards') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data     = JSON.parse(body);
        const filePath = path.join(__dirname, 'src', 'cards', 'card-database.json');
        fs.mkdirSync(path.join(__dirname, 'src', 'cards'), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }


  if (method === 'GET' && url.pathname === '/blacklist') {
    const filePath = path.join(__dirname, 'src', 'equipment', 'equipment-blacklist.json');
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(content);
    } catch {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ blacklist: [] }));
    }
    return;
  }

  if (method === 'POST' && url.pathname === '/blacklist') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data     = JSON.parse(body);
        const filePath = path.join(__dirname, 'src', 'equipment', 'equipment-blacklist.json');
        fs.mkdirSync(path.join(__dirname, 'src', 'equipment'), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Stop bot
  if (method === 'POST' && url.pathname === '/bot/stop') {
    const stopped = stopBot();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: stopped }));
    return;
  }

  // 404
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║   Fallen London Bot — Control Panel   ║`);
  console.log(`╚══════════════════════════════════════╝`);
  console.log(`\nOpening GUI at http://localhost:${PORT}`);
  console.log(`Press Ctrl+C to shut down the server\n`);

  
  const opener =
    process.platform === 'win32'  ? 'start' :
    process.platform === 'darwin' ? 'open'  : 'xdg-open';

  spawn(opener, [`http://localhost:${PORT}`], { shell: true, detached: true });
});

process.on('SIGINT', () => {
  if (botProcess) botProcess.kill('SIGINT');
  process.exit(0);
});