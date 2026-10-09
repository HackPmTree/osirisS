/* Диагностика: где именно детекор теряет синтетический окоп. */
function gradientField(g: { w: number; h: number; data: Uint8Array }) {
  const { w, h, data } = g;
  const mag = new Float32Array(w * h);
  let sum = 0, sum2 = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = -data[i-w-1]-2*data[i-1]-data[i+w-1]+data[i-w+1]+2*data[i+1]+data[i+w+1];
    const gy = -data[i-w-1]-2*data[i-w]-data[i-w+1]+data[i+w-1]+2*data[i+w]+data[i+w+1];
    const m = Math.hypot(gx, gy); mag[i] = m; sum += m; sum2 += m*m;
  }
  const n = (w-2)*(h-2), mean = sum/n, std = Math.sqrt(Math.max(0, sum2/n-mean*mean));
  return { mag, mean, std };
}
function morph(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(w*h);
  if (r > 0) {
    for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
      let hit=0;
      for (let oy=-r;oy<=r&&!hit;oy++) for (let ox=-r;ox<=r&&!hit;ox++) {
        const nx=x+ox, ny=y+oy;
        if (nx>=0&&ny>=0&&nx<w&&ny<h&&src[ny*w+nx]) hit=1;
      }
      out[y*w+x]=hit;
    }
  } else {
    const rr=-r;
    for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
      let all=src[y*w+x]?1:0;
      for (let oy=-rr;oy<=rr&&all;oy++) for (let ox=-rr;ox<=rr&&all;ox++) {
        const nx=x+ox, ny=y+oy;
        if (nx<0||ny<0||nx>=w||ny>=h||!src[ny*w+nx]) all=0;
      }
      out[y*w+x]=all;
    }
  }
  return out;
}
function components(mask: Uint8Array, w: number, h: number) {
  const seen=new Uint8Array(w*h); const comps:{px:number;xs:number[];ys:number[]}[]=[]; const stack:number[]=[];
  for (let start=0;start<w*h;start++) {
    if (!mask[start]||seen[start]) continue;
    seen[start]=1; stack.length=0; stack.push(start);
    let px=0; const xs:number[]=[], ys:number[]=[];
    while (stack.length) {
      const i=stack.pop()!; const x=i%w, y=(i/w)|0; px++; xs.push(x); ys.push(y);
      for (let oy=-1;oy<=1;oy++) for (let ox=-1;ox<=1;ox++) {
        const nx=x+ox, ny=y+oy; if (nx<0||ny<0||nx>=w||ny>=h) continue;
        const j=ny*w+nx; if (mask[j]&&!seen[j]) { seen[j]=1; stack.push(j); }
      }
    }
    comps.push({px,xs,ys});
  }
  return comps;
}

const W=512,H=512,GSD=0.19;
const data=new Uint8Array(W*H);
let seed=42;
const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return (seed%1000)/1000;};
for (let i=0;i<W*H;i++) data[i]=150+Math.round((rnd()-0.5)*50);
const roadY=120, roadHW=Math.round(8/GSD/2);
for (let y=roadY-roadHW;y<=roadY+roadHW;y++) for (let x=5;x<W-5;x++) data[y*W+x]=170;
const trenchHW=Math.round(2.7/GSD/2);
let ty=380;
for (let x=10;x<W-10;x++){
  const seg=Math.floor(x/45), phase=seg%2, localX=x%45;
  ty=380+(phase===0?localX:45-localX)*0.6-13;
  const yc=Math.round(ty);
  for (let dy=-trenchHW;dy<=trenchHW;dy++){
    const yy=yc+dy; if(yy<0||yy>=H)continue;
    data[yy*W+x]=Math.max(0,Math.min(255,70+Math.round((rnd()-0.5)*90)));
  }
}

const {mag,mean,std}=gradientField(data as any && {w:W,h:H,data});
const medS=[...mag].filter((_,i)=>i%7===0).sort((a,b)=>a-b);
const med=medS[Math.floor(medS.length/2)], upper=medS[Math.floor(medS.length*0.75)];
const gradThresh=Math.max(1e-3, Math.min(upper, 3*med));
const loDark=Math.max(0,mean-1.1*std), hiDark=Math.min(255,mean+0.55*std);
console.log({mean:mean.toFixed(1),std:std.toFixed(1),med:med.toFixed(1),gradThresh:gradThresh.toFixed(1),loDark:loDark.toFixed(1),hiDark:hiDark.toFixed(1)});

const darkOnly=new Uint8Array(W*H);
let dc=0; for(let i=0;i<W*H;i++){darkOnly[i]=data[i]<=loDark?1:0; dc+=darkOnly[i];}
console.log('darkOnly px:',dc);

// сколько тёмных пикселей в зоне окопа (y 340..420)?
let inTrench=0; for(let y=340;y<420;y++) for(let x=10;x<502;x++) inTrench+=darkOnly[y*W+x];
console.log('dark px в коридоре окопа:', inTrench);

// дилатация ядра на 2 и компоненты — связность зигзага
const dil=morph(darkOnly,W,H,2);
const comps=components(dil,W,H);
comps.sort((a,b)=>b.px-a.px);
for (const c of comps.slice(0,6)) {
  const minx=Math.min(...c.xs),maxx=Math.max(...c.xs),miny=Math.min(...c.ys),maxy=Math.max(...c.ys);
  console.log(`comp px=${c.px} x[${minx}..${maxx}] y[${miny}..${maxy}]`);
}
