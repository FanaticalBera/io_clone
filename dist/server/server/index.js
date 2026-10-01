import { createGameServer } from './app.js';
const port = Number(process.env.PORT ?? 3001), host = process.env.HOST ?? '0.0.0.0', maxRooms = Number(process.env.MAX_ROOMS ?? 10);
if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Invalid PORT');
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(v => v.trim()).filter(Boolean) ?? (import.meta.url.endsWith('.ts') ? ['http://localhost:5173', 'http://127.0.0.1:5173'] : []);
const server = createGameServer({ maxRooms, allowedOrigins, log: (event, fields) => console.log(JSON.stringify({ event, ...fields })) });
server.http.listen(port, host, () => console.log('HEXHOLD http://' + (host === '0.0.0.0' ? 'localhost' : host) + ':' + port));
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => { if (closing)
        return; closing = true; server.close().then(() => process.exit(0)); });
