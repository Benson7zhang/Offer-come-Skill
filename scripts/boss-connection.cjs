const fs = require('node:fs');
const readline = require('node:readline');
const path = require('node:path');
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--port-file')) throw new Error('Usage: node boss-connection.cjs [--port-file PATH]');
if (!args.length && !process.env.LOCALAPPDATA) throw new Error('Specify --port-file for your Chrome profile');
const portFile = args[1] || path.join(process.env.LOCALAPPDATA, 'Google/Chrome/User Data/DevToolsActivePort');
const parts = fs.readFileSync(portFile, 'utf8').trim().split(String.fromCharCode(10)).map(s => s.trim());
if (!/^\d+$/.test(parts[0]) || Number(parts[0]) < 1 || Number(parts[0]) > 65535 || !parts[1]?.startsWith('/devtools/browser/')) throw new Error('Invalid DevToolsActivePort file');
const ws = new WebSocket('ws://127.0.0.1:' + parts[0] + parts[1]);
const pending = new Map();
let nextId = 0;
const output = value => console.log(JSON.stringify(value));
function call(method, params = {}, sessionId) {
  if (ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Browser connection is not open'));
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method + '; outcome may be unknown; do not blindly retry mutations')); }, 30000);
    pending.set(id, {resolve, reject, timer});
    ws.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}));
  });
}
ws.onmessage = event => {
  const message = JSON.parse(event.data);
  const item = pending.get(message.id);
  if (!item) return;
  clearTimeout(item.timer); pending.delete(message.id);
  if (message.error) item.reject(new Error(JSON.stringify(message.error)));
  else item.resolve(message.result);
};
const connectTimer = setTimeout(() => { output({error:'Connection authorization timed out'}); ws.close(); process.exitCode = 1; }, 180000);
ws.onopen = () => {clearTimeout(connectTimer); output({ready:true,pid:process.pid});};
ws.onerror = event => output({error:'WebSocket error',detail:event.message || 'Connection failed'});
ws.onclose = () => {
  clearTimeout(connectTimer);
  for (const item of pending.values()) {clearTimeout(item.timer); item.reject(new Error('Browser disconnected; command outcome may be unknown'));}
  pending.clear(); output({closed:true}); process.exit(0);
};
async function execute(command) {
  if (command.action === 'list') return (await call('Target.getTargets')).targetInfos.filter(t => t.type === 'page');
  if (command.action === 'stop') {ws.close(); return {stopping:true};}
  if (command.action === 'open') return call('Target.createTarget', {url:command.url});
  if (command.action !== 'eval') throw new Error('Unsupported action');
  const {sessionId} = await call('Target.attachToTarget', {targetId:command.targetId, flatten:true});
  try {
    const expression = fs.readFileSync(command.file, 'utf8');
    const result = await call('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true}, sessionId);
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result;
  } finally {await call('Target.detachFromTarget', {sessionId});}
}
let queue = Promise.resolve();
const input = readline.createInterface({input:process.stdin,terminal:false});
input.on('line', line => {
  if (!line.trim()) return;
  queue = queue.then(async () => {
    let command;
    try {command = JSON.parse(line); output({requestId:command.requestId,result:await execute(command)});}
    catch (error) {output({requestId:command?.requestId,error:error.message});}
  });
});
input.on('close', () => ws.close());
