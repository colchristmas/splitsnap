// Stops any SplitSnap dev/preview servers still running, including ones
// paused with Ctrl+Z (which keep their port), so ports are freed.
// Runs before `npm run dev`/`preview`, and on its own as `npm run stop`.
// Works on macOS and Linux (ps) and on Windows (PowerShell, as it has no ps).
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const windows = process.platform === 'win32'
// Paths are compared with forward slashes, and on Windows ignoring case, so
// `F:\…\splitsnap` and `f:/…/splitsnap` match.
const normalize = (s) => {
  const slashed = s.replaceAll('\\', '/').replace(/\/{2,}/g, '/')
  return windows ? slashed.toLowerCase() : slashed
}
const root = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'))

// This project's vite runs as `node …/node_modules/.bin/vite` on macOS and
// Linux, and as `node …/node_modules/.bin/../vite/bin/vite.js` (via the .cmd
// shim) on Windows. The \b keeps vitest (`.bin/vitest`) from matching.
const isServer = (command) =>
  command.includes(`${root}/node_modules/`) && /\/(\.bin\/vite|vite\/bin\/vite\.js)\b/.test(command)

function listProcesses() {
  if (windows) {
    // Only node.exe can be a server. Encoded so no quoting survives the shell.
    const script = `[Console]::OutputEncoding = [Text.Encoding]::UTF8
ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
  Select-Object ProcessId, ParentProcessId, CommandLine)`
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
    return JSON.parse(out.trim() || '[]')
      .filter(Boolean)
      .map((p) => ({ pid: p.ProcessId, ppid: p.ParentProcessId, command: normalize(p.CommandLine ?? '') }))
  }
  return execFileSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' })
    .split('\n')
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line))
    .filter(Boolean)
    .map(([, pid, ppid, command]) => ({ pid: Number(pid), ppid: Number(ppid), command: normalize(command) }))
}

let procs
try {
  procs = listProcesses()
} catch (error) {
  // A convenience, so never block `npm run dev` over it.
  console.warn(`Couldn't check for running SplitSnap servers (${error.message.split('\n')[0]}).`)
  process.exit(0)
}

const servers = procs.filter((p) => isServer(p.command) && p.pid !== process.pid)
// Their `npm run dev` / `npm exec vite` parents too, or paused ones linger.
// (On Windows the parent is cmd.exe, which exits along with the server.)
const parents = procs.filter((p) => servers.some((s) => s.ppid === p.pid) && /\bnpm\b/.test(p.command))

const targets = [...servers, ...parents].map((p) => p.pid)
const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
const signal = (pid, sig) => {
  try {
    process.kill(pid, sig)
  } catch {
    // already gone
  }
}

for (const pid of targets) {
  signal(pid, 'SIGTERM') // on Windows, this ends the process outright
  if (!windows) signal(pid, 'SIGCONT') // a paused process only handles SIGTERM once resumed
}
// A server paused in a background terminal can pause itself again on its way
// out (it tries to print). Give them a moment, then force-stop the rest.
for (let i = 0; i < 20 && targets.some(alive); i++) await new Promise((r) => setTimeout(r, 100))
for (const pid of targets.filter(alive)) signal(pid, 'SIGKILL')

if (servers.length) console.log(`Stopped ${servers.length} SplitSnap server${servers.length === 1 ? '' : 's'}; ports freed.`)
else if (process.argv.includes('--verbose')) console.log('No SplitSnap servers were running.')
