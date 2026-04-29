import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const resolveBin = (name) => resolve(
  rootDir,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? `${name}.cmd` : name
);

const viteBin = resolveBin('vite');
const builderBin = resolveBin('electron-builder');
const builderArgs = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--'));

const run = (command, args) => new Promise((resolvePromise, reject) => {
  const child = spawn(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env,
    // Windows package manager shims are .cmd files and must run via a shell.
    shell: process.platform === 'win32',
  });

  child.on('exit', (code) => {
    if (code === 0) {
      resolvePromise(undefined);
      return;
    }

    reject(new Error(`${command} exited with code ${code ?? 1}`));
  });
});

await run(viteBin, ['build']);
await run(builderBin, builderArgs.length > 0 ? builderArgs : []);
