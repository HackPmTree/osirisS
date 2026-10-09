import { readFileSync } from 'fs';
const test = readFileSync('scratch/detector_test.ts','utf8');
// вырежем генератор кадра и функции, собрав debug-скрипт
const gen = `
const W = 512, H = 512, GSD = 0.19;
const data = new Uint8Array(W * H);
let seed = 42;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed % 1000) / 1000; };
for (let i = 0; i < W*H; i++) data[i] = 150 + Math.round((rnd()-0.5)*50);
const roadY = 120, roadHW = Math.round(8/GSD/2);
for (let y = roadY-roadHW; y <= roadY+roadHW; y++) for (let x = 5; x < W-5; x++) data[y*W+x] = 170;
const trenchHW = Math.round(2.7/GSD/2);
let ty = 380;
for (let x = 10; x < W-10; x++) {
  const seg = Math.floor(x / 45), phase = seg % 2, localX = x % 45;
  ty = 380 + (phase === 0 ? localX : 45 - localX) * 0.6 - 13;
  const yc = Math.round(ty);
  for (let dy = -trenchHW; dy <= trenchHW; dy++) {
    const yy = yc + dy; if (yy < 0 || yy >= H) continue;
    data[yy*W+x] = Math.max(0, Math.min(255, 70 + Math.round((rnd()-0.5)*90)));
  }
}
`;
const fns = test.slice(test.indexOf('function gradientField'), test.indexOf('// ── Генерация'));
eval(fns + gen + `
const g = { w: W, h: H, data };
const { mag, mean, std } = gradientField(g);
console.log('mean', mean.toFixed(1), 'std', std.toFixed(1));
const loDark = Math.max(0, mean - 1.1*std), hiDark = Math.min(255, mean + 0.55*std);
console.log('loDark', loDark.toFixed(1), 'hiDark', hiDark.toFixed(1));
let darkCount = 0; for (let i=0;i<W*H;i++) if (data[i]<=loDark) darkCount++;
console.log('darkOnly px:', darkCount);
const dil = morph(darkOnly.map((v,i)=> v), W, H, 2); // дилатация ядра для проверки связности
const comps = components(dil, W, H);
comps.sort((a,b)=>b.px-a.px);
console.log('top comps:', comps.slice(0,5).map(c=>({px:c.px, spanX:Math.max(...c.xs)-Math.min(...c.xs), spanY:Math.max(...c.ys)-Math.min(...c.ys)})));
`);
