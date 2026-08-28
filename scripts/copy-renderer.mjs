/**
 * Chep src/renderer/ sang out/renderer/.
 *
 * Giao dien la HTML + JS thuan, `tsc` khong dong toi. Neu de nguyen o src/ roi
 * tro duong dan vao do thi ban dong goi se hong: khi da thanh .exe, `src/`
 * khong con nam canh file thuc thi nua. Chep sang out/ de dev va ban dong goi
 * dung CHUNG mot duong dan tuong doi tu __dirname.
 */

import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const goc = join(dirname(fileURLToPath(import.meta.url)), '..');
const tu = join(goc, 'src', 'renderer');
const den = join(goc, 'out', 'renderer');

mkdirSync(den, { recursive: true });
cpSync(tu, den, { recursive: true });
console.log(`da chep ${tu} -> ${den}`);
