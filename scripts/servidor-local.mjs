// Sobe um ambiente local completo para desenvolvimento/testes manuais:
// MongoDB em memória + `next start` (build de produção) apontando para ele.
// Uso: node scripts/servidor-local.mjs   (Ctrl+C encerra; o banco é descartado)
import { MongoMemoryServer } from 'mongodb-memory-server';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTA = Number(process.env.PORTA || 3111);

const mongod = await MongoMemoryServer.create();
console.log(`MongoDB em memória: ${mongod.getUri()}`);
console.log(`Servidor: http://127.0.0.1:${PORTA}`);

const child = spawn(
  process.execPath,
  [path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(PORTA)],
  { cwd: ROOT, env: { ...process.env, MONGODB_URI: mongod.getUri() }, stdio: 'inherit' }
);

const encerrar = async () => {
  if (!child.killed) child.kill();
};
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
child.on('exit', async () => {
  await mongod.stop({ doCleanup: true });
  process.exit(0);
});
