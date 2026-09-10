// ============================================================
//  Run the Tauri CLI with cargo guaranteed to be on PATH.
//
//  rustup adds ~/.cargo/bin to the *persisted* user PATH, but a shell
//  that was already open when Rust was installed never sees it —
//  Windows hands a process its environment at startup. The symptom is
//  Tauri failing with "cargo metadata ... program not found" even
//  though Rust is installed and working fine.
//
//  Telling everyone to reopen their terminal works, but it has to be
//  remembered, and it comes back on every new machine. Resolving the
//  path here makes `npm run desktop:dev` work from any shell.
// ============================================================
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, delimiter } from 'node:path';

const cargoBin = join(homedir(), '.cargo', 'bin');
const env = { ...process.env };

if (!existsSync(cargoBin)) {
  console.error(`\n  Rust was not found at ${cargoBin}`);
  console.error('  Install it from https://rustup.rs, then run this again.\n');
  process.exit(1);
}

const current = env.PATH || env.Path || '';
// Case-insensitive: Windows paths vary in casing between shells.
const alreadyThere = current
  .split(delimiter)
  .some((p) => p.toLowerCase() === cargoBin.toLowerCase());
if (!alreadyThere) env.PATH = cargoBin + delimiter + current;

// Run the CLI's JavaScript entry with this same Node, rather than the
// node_modules/.bin shim: Node 22 refuses to spawn a .cmd without a shell
// (CVE-2024-27980), and going through a shell would mean quoting every
// argument correctly on two platforms. This sidesteps both.
const entry = join(process.cwd(), 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
if (!existsSync(entry)) {
  console.error('\n  @tauri-apps/cli is not installed. Run: npm install\n');
  process.exit(1);
}

const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
});
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
child.on('error', (err) => {
  console.error('Could not start the Tauri CLI:', err.message);
  process.exit(1);
});
