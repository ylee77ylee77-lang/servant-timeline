/**
 * Female b1 medium-length hairstyle review candidate. Only lower locks
 * are resampled; the original face, upper hair and other sources remain.
 * Offline only. Do not register these assets until review passes.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const S = 512;
const clamp = n => Math.max(0, Math.min(1, n));
const smooth = n => { const t=clamp(n); return t*t*(3-2*t); };
const hash = b => createHash("sha256").update(b).digest("hex");
const offset = (x,y) => (y*S+x)*4;
async function rgba(bytes) {
  const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.deepEqual([info.width,info.height,info.channels],[S,S,4]);
  return data;
}
const encodePng = data => sharp(data,{raw:{width:S,height:S,channels:4}}).png({compressionLevel:9,palette:false}).toBuffer();
function sampleHair(source,material,sx,sy) {
  const x0=Math.floor(sx), y0=Math.floor(sy), fx=sx-x0, fy=sy-y0;
  let a=0,r=0,g=0,b=0;
  for(let dy=0;dy<2;dy++) for(let dx=0;dx<2;dx++) {
    const x=x0+dx,y=y0+dy;
    if(x<0||x>=S||y<0||y>=S)continue;
    const i=offset(x,y);
    // Exclude original sweater and transparent pixels from the donor.
    const brown=smooth((195-source[i])/47)*smooth((160-source[i+1])/42);
    const w=(dx?fx:1-fx)*(dy?fy:1-fy)*source[i+3]/255*material[i]/255*brown;
    a+=w; r+=source[i]*w; g+=source[i+1]*w; b+=source[i+2]*w;
  }
  return a>0?[r/a,g/a,b/a,a]:[0,0,0,0];
}
export async function buildFemaleMediumCandidate(root,output) {
  const read=rel=>fs.readFile(path.join(root,rel));
  const sourceBytes=await read("public/avatar/scenes/b1/female-b.webp");
  const materialBytes=await read("public/avatar/materials/b1/female-b.png");
  const headBytes=await read("public/avatar/fits/b1/female-b-head.png");
  const garmentBytes=await read("public/avatar/fits/b1/female-b-garment.png");
  assert.equal(hash(sourceBytes),"a430def8598cf69c2087a1d203530f0e1b23bfa00538de513e5137c6f4741a0f");
  assert.equal(hash(materialBytes),"f91248a0dee0d67a9c2a5bcb15ad569c03d08110a00ba94440c78130b75702d4");
  assert.equal(hash(headBytes),"25b6900c02fe1e133eb071a6782d44b8be0e38708b9f570bc78b5e2e94f0d536");
  assert.equal(hash(garmentBytes),"16d896f704cdd07b0714f242b1df1a8d6e05c85a6276f7838b50096faf8b90ce");
  const [source,material,head,garment]=await Promise.all([sourceBytes,materialBytes,headBytes,garmentBytes].map(rgba));
  const lock=await sharp(await read("docs/avatar-face-masters/hairstyles/female-b-locked.png")).greyscale().raw().toBuffer();
  const art=Buffer.from(source), coverage=Buffer.from(material), keep=Buffer.from(head), fill=Buffer.from(garment);
  let changed=0,locked=0,extension=0,left=0,right=0;
  for(let y=0;y<S;y++) for(let x=0;x<S;x++) {
    const p=y*S+x,i=p*4;
    if(lock[p]){locked++;continue;}
    if(y<355||y>510||(x>=211&&x<=302))continue;
    const isLeft=x<256, side=isLeft?-1:1;
    const length=isLeft?.53:.50;
    // Smooth join above the shoulder, unequal lengths, slightly inward
    // curled ends so the added length stays visible in the round avatar.
    const sy=y-(y-345)*length*smooth((y-345)/40);
    const t=clamp((y-355)/150);
    const curve=(isLeft?25:20)*t*t-6*Math.sin(t*Math.PI);
    const sx=x+side*curve;
    const [r,g,b,a]=sampleHair(source,material,sx,sy);
    const edge=isLeft?smooth((211-x)/9):smooth((x-302)/9);
    const opacity=clamp(a*smooth((y-355)/20)*edge);
    if(opacity<1/255)continue;
    const oldA=source[i+3]/255, newA=opacity+oldA*(1-opacity);
    for(const [c,value] of [r,g,b].entries())art[i+c]=Math.round((value*opacity+source[i+c]*oldA*(1-opacity))/newA);
    art[i+3]=Math.round(newA*255);
    coverage[i]=Math.min(255,Math.round(255*opacity+material[i]*(1-opacity)));
    coverage[i+1]=Math.min(255-coverage[i],Math.round(material[i+1]*(1-opacity)));
    coverage[i+2]=0;coverage[i+3]=255;
    if(y>=390){
      const k=Math.max(head[i+3],Math.round(opacity*255));
      keep[i+3]=k;
      const aa=art[i+3]/255, retained=aa*k/255;
      fill[i+3]=retained>=1?0:Math.round(255*clamp((aa-retained)/(1-retained)));
    }
    if(y>=436&&opacity>.65){extension++;if(isLeft)left++;else right++;}
    if(!art.subarray(i,i+4).equals(source.subarray(i,i+4)))changed++;
  }
  assert.equal(locked,31972);
  assert.ok(extension>1800&&left>500&&right>500,"New hair must extend over both shoulders");
  assert.ok(changed>3000);
  const artBytes=await sharp(art,{raw:{width:S,height:S,channels:4}}).webp({lossless:true,effort:6}).toBuffer();
  const files={
    "female-b-medium.webp":artBytes,
    "female-b-medium-material.png":await encodePng(coverage),
    "female-b-medium-head.png":await encodePng(keep),
    "female-b-medium-garment.png":await encodePng(fill),
  };
  const verified=await rgba(artBytes);
  let alphaError=0;
  for(let p=0;p<S*S;p++) {
    const i=p*4;
    if(lock[p]||(p<S*355&&source[i+3]>0))assert.deepEqual(verified.subarray(i,i+4),source.subarray(i,i+4),"Face or upper hair changed");
    if(p<S*355)assert.equal(verified[i+3],source[i+3]);
    assert.ok(coverage[i]+coverage[i+1]<=255);
    const a=verified[i+3]/255,k=keep[i+3]/255,g=fill[i+3]/255;
    alphaError=Math.max(alphaError,Math.abs(255*(a*k+g*(1-a*k)-a)));
    if(p<S*390){assert.equal(keep[i+3],255);assert.equal(fill[i+3],0);}
    if(a===0)assert.equal(fill[i+3],0);
  }
  assert.ok(alphaError<=.501,"Garment alpha complement changed");
  assert.ok(artBytes.length<180*1024,"Mobile source budget");
  assert.ok(files["female-b-medium-material.png"].length<24*1024);
  assert.ok(files["female-b-medium-head.png"].length+files["female-b-medium-garment.png"].length<24*1024);
  const dir=path.join(output,"female-medium-candidate");
  await fs.mkdir(dir,{recursive:true});
  const proof={status:"CANDIDATE_ONLY",locked,changed,extension,left,right,alphaError,files:{}};
  for(const [name,bytes] of Object.entries(files)){
    await fs.writeFile(path.join(dir,name),bytes);
    proof.files[name]={sha256:hash(bytes),bytes:bytes.length};
  }
  const items=[
    ["Previous original",sourceBytes],["Medium-length trial",artBytes],
    ["Bob (unchanged)",await read("public/avatar/scenes/b1/female-b-bob.webp")],
    ["Bun (unchanged)",await read("public/avatar/scenes/b1/female-b-bun.webp")],
  ];
  const circle=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><circle cx="128" cy="128" r="118" fill="white"/></svg>');
  const tiles=[];
  for(const [col,[label,bytes]] of items.entries()){
    const scaled=await sharp(bytes).resize(236,236).png().toBuffer();
    const bg=await sharp({create:{width:256,height:256,channels:4,background:"#DCE9F7"}}).composite([{input:scaled,left:10,top:14}]).png().toBuffer();
    const clipped=await sharp(bg).composite([{input:circle,blend:"dest-in"}]).png().toBuffer();
    const small=await sharp(clipped).resize(48,48).png().toBuffer();
    tiles.push({input:clipped,left:col*256,top:26},{input:small,left:col*256+104,top:290});
    tiles.push({input:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="26"><text x="8" y="19" font-family="sans-serif" font-size="14" fill="#484151">'+label+'</text></svg>'),left:col*256,top:0});
  }
  const review=await sharp({create:{width:1024,height:346,channels:3,background:"#F4F1F8"}}).composite(tiles).jpeg({quality:88}).toBuffer();
  await fs.writeFile(path.join(dir,"comparison.jpg"),review);
  await fs.writeFile(path.join(dir,"proof.json"),JSON.stringify(proof,null,2)+"\n");
  console.log("FEMALE_MEDIUM_PROOF "+JSON.stringify(proof));
  // Verify the registered assets reproduce the reviewed candidate.
  // Compare decoded pixels rather than encoded bytes across encoder versions.
  const registered = {
    "female-b-medium.webp":"public/avatar/scenes/b1/female-b-medium.webp",
    "female-b-medium-material.png":"public/avatar/materials/b1/female-b-medium.png",
    "female-b-medium-head.png":"public/avatar/fits/b1/female-b-medium-head.png",
    "female-b-medium-garment.png":"public/avatar/fits/b1/female-b-medium-garment.png",
  };
  for(const [name,relative] of Object.entries(registered)){
    const committed=await read(relative);
    assert.deepEqual(await rgba(committed),await rgba(files[name]),name+": registered artwork differs from reviewed candidate");
  }
  return proof;
}
