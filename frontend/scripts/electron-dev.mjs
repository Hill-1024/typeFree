import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const host = '127.0.0.1';
const port = 5173;
const devServerUrl = `http://${host}:${port}/`;

const resolveBin = (name) => resolve(
  rootDir,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? `${name}.cmd` : name
);

const viteBin = resolveBin('vite');
const electronBin = resolveBin('electron');

const processes = new Set();

const spawnProcess = (command, args, extraEnv = {}) => {
  const child = spawn(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...extraEnv,
    },
  });

  processes.add(child);
  child.on('exit', () => processes.delete(child));
  return child;
};

const shutdown = (exitCode = 0) => {
  for (const child of processes) {
    child.kill('SIGTERM');
  }
  process.exit(exitCode);
};

const waitForDevServer = async () => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(devServerUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting.
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }

  throw new Error(`Timed out waiting for Vite dev server at ${devServerUrl}`);
};

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const viteProcess = spawnProcess(viteBin, ['--host', host, '--port', String(port)]);
viteProcess.on('exit', (code) => {
  if (code && code !== 0) {
    shutdown(code);
  }
});

try {
  await waitForDevServer();
  const electronProcess = spawnProcess(electronBin, ['.'], {
    VITE_DEV_SERVER_URL: devServerUrl,
  });

  electronProcess.on('exit', (code) => {
    shutdown(code ?? 0);
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  shutdown(1);
}
