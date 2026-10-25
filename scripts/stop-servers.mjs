// Stops any SplitSnap dev/preview servers still running, including ones
// paused with Ctrl+Z (which keep their port), so ports are freed.
// Runs before `npm run dev`/`preview`, and on its own as `npm run stop`.
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const vite = join(root, 'node_modules/.bin/vite')

const procs = execFileSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' })
  .split('\n')
  .map((line) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line))
  .filter(Boolean)
  .map(([, pid, ppid, command]) => ({ pid: Number(pid), ppid: Number(ppid), command }))

const servers = procs.filter((p) => p.command.includes(vite) && p.pid !== process.pid)
// Their `npm run dev` / `npm exec vite` parents too, or paused ones linger.
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
  signal(pid, 'SIGTERM')
  signal(pid, 'SIGCONT') // a paused process only handles SIGTERM once resumed
}
// A server paused in a background terminal can pause itself again on its way
// out (it tries to print). Give them a moment, then force-stop the rest.
for (let i = 0; i < 20 && targets.some(alive); i++) await new Promise((r) => setTimeout(r, 100))
for (const pid of targets.filter(alive)) signal(pid, 'SIGKILL')

if (servers.length) console.log(`Stopped ${servers.length} SplitSnap server${servers.length === 1 ? '' : 's'}; ports freed.`)
else if (process.argv.includes('--verbose')) console.log('No SplitSnap servers were running.')
