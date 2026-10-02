// Menjalankan setiap file test secara berurutan (node --test memproses paralel
// dan semua file test berbagi satu file SQLite yang sama).
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, 'tests');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.js')).sort();
if (!files.length) { console.log('tidak ada file test'); process.exit(1); }

let gagal = 0, totalPass = 0, totalFail = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, ['--test', path.join(dir, f)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const out = r.stdout || '';
  const m = out.match(/ℹ pass (\d+)/);
  const mf = out.match(/ℹ fail (\d+)/);
  const p = Number(m ? m[1] : 0), fl = Number(mf ? mf[1] : 0);
  totalPass += p; totalFail += fl;
  const status = r.status === 0 ? 'OK ' : 'GAGAL';
  console.log(`${status} ${f} — pass ${p} / fail ${fl}`);
  if (r.status !== 0) {
    gagal++;
    console.log(out.split('\n').filter(l => /^(✖|AssertionError|Error|actual:|expected:)/.test(l)).slice(0, 6).join('\n'));
  }
}
console.log(`\nTOTAL: ${files.length} file, pass ${totalPass}, fail ${totalFail}`);
process.exit(gagal ? 1 : 0);
