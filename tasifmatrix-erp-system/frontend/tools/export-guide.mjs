// Writes public/guide-index.json: the user guide's text (English and Bangla) for the help
// assistant on the server. The guide itself lives in src/app/features/guide/guide-content.ts;
// this runs before every build (npm "prebuild"), so the assistant always answers from the guide
// that ships with the app. Pictures are left out: the assistant reads only the words.
//
//   node tools/export-guide.mjs
import { build } from 'esbuild';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'guide-index.json');
const tmp = mkdtempSync(join(tmpdir(), 'guide-'));
const bundle = join(tmp, 'guide.mjs');

try {
  await build({
    entryPoints: [join(root, 'src/app/features/guide/guide-content.ts')],
    bundle: true, format: 'esm', platform: 'node', outfile: bundle, logLevel: 'error',
  });
  const { GUIDE } = await import(pathToFileURL(bundle).href);

  const languages = {};
  for (const lang of ['en', 'bn']) {
    languages[lang] = {
      sections: GUIDE[lang].sections.map((s) => ({
        id: s.id,
        title: s.title,
        intro: s.intro ?? null,
        roles: s.roles ?? null,
        webOnly: !!s.webOnly,
        parts: s.parts.map((p) => ({ title: p.title ?? null, steps: p.steps })),
        tips: s.tips ?? [],
        faq: s.faq ?? [],
        // On a computer the guide shows its own steps for some sections ("Click ... in the left menu").
        desktop: GUIDE[lang].desktop[s.id]
          ? {
              intro: GUIDE[lang].desktop[s.id].intro ?? null,
              parts: GUIDE[lang].desktop[s.id].parts?.map((p) => ({ title: p.title ?? null, steps: p.steps })) ?? null,
              tips: GUIDE[lang].desktop[s.id].tips ?? null,
            }
          : null,
      })),
    };
  }
  const json = JSON.stringify({ version: 1, languages }, null, 1) + '\n';
  let previous = '';
  try { previous = readFileSync(out, 'utf8'); } catch { /* first run */ }
  if (previous !== json) writeFileSync(out, json);
  const count = languages.en.sections.length;
  console.log(`guide-index.json: ${count} sections${previous === json ? ' (unchanged)' : ''}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
