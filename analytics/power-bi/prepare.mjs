// Validate with the extension itself; SQL owns the relational transformation.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(directory, '../../match-data.js'), 'utf8'), context);
export function validate(payload) {
  // A bad envelope is a failed import, never a misleading empty dataset.
  if (payload?.schemaVersion !== 1 || !Array.isArray(payload.matches)) {
    throw new Error('Unsupported history format.');
  }
  const counts = new Map();
  for (const row of payload.matches) {
    if (typeof row?.id === 'string') counts.set(row.id, (counts.get(row.id) ?? 0) + 1);
  }
  const accepted = [], rejected = [];
  payload.matches.forEach((row, index) => {
    let reason;
    if (counts.get(row?.id) > 1) reason = 'duplicate_match_id';
    else {
      try { context.readHistory({ schemaVersion: 1, matches: [row] }); }
      catch { reason = 'invalid_match_record'; }
    }
    if (reason) rejected.push({ sourceRow: index + 1, matchId: typeof row?.id === 'string' ? row.id : null, reason });
    else accepted.push({ ...row, recordingDate: row.recordedAt === null ? 'Unknown' : new Date(row.recordedAt).toISOString().slice(0, 10) });
  });
  return { accepted, rejected };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = process.argv[2] ?? path.join(directory, 'data/synthetic-match-history.json');
  process.stdout.write(JSON.stringify(validate(JSON.parse(fs.readFileSync(source, 'utf8')))));
}
