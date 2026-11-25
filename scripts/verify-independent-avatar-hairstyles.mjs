/** Candidate-only proof. No runtime catalog registration. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
async function decode(bytes) {
  const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.deepEqual([info.width,info.height,info.channels],[512,512,4]);
  return data;
}

export async function verifyIndependentHairstyles(root, output) {
  const dir=path.join(root,"docs/avatar-face-masters");
  const hair=path.join(dir,"hairstyles");
  const spec=JSON.parse(await fs.readFile(path.join(hair,"manifest.json"),"utf8"));
  assert.equal(spec.status,"candidate-only");
  assert.deepEqual(Object.keys(spec.sources).sort(),["female-b","male-b"]);
  assert.deepEqual(Object.keys(spec.variants).sort(),["female-b-bob","female-b-bun","male-b-short","male-b-side"]);
  const masters=new Map(), cases=[], tiles=[];
  for(const [row,id] of ["male-b","female-b"].entries()) {
    const source=spec.sources[id];
    const bytes=await fs.readFile(path.join(dir,id+".webp"));
    const lockBytes=await fs.readFile(path.join(hair,id+"-locked.png"));
    assert.equal(hash(bytes),source.sha256);
    assert.equal(hash(lockBytes),source.lockSha256);
    const master=await decode(bytes);
    const {data:lock,info}=await sharp(lockBytes).greyscale().raw().toBuffer({resolveWithObject:true});
    assert.deepEqual([info.width,info.height,info.channels],[512,512,1]);
    let count=0;
    for(let i=0;i<lock.length;i++) {
      assert.ok(lock[i]===0||lock[i]===255);
      if(lock[i]) {count++; assert.equal(master[i*4+3],255);}
    }
    assert.equal(count,source.protectedPixels);
    assert.ok(count>30000);
    masters.set(id,{master,lock,count,row});
  }
  const circle=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><circle cx="128" cy="128" r="118" fill="white"/></svg>');
  async function tile(bytes,row,col,label) {
    const resized=await sharp(bytes).resize(236,236).png().toBuffer();
    const bg=await sharp({create:{width:256,height:256,channels:4,background:"#DCE9F7"}})
      .composite([{input:resized,left:10,top:14}]).png().toBuffer();
    const clipped=await sharp(bg).composite([{input:circle,blend:"dest-in"}]).png().toBuffer();
    tiles.push({input:clipped,left:col*256,top:row*282});
    tiles.push({input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="24"><text x="8" y="17" font-family="sans-serif" font-size="13" fill="#51465F">${label}</text></svg>`),left:col*256,top:row*282+256});
  }
  for(const [id,master] of masters) await tile(await fs.readFile(path.join(dir,id+".webp")),master.row,0,id+" original");
  for(const [id,v] of Object.entries(spec.variants)) {
    assert.equal(id.startsWith(v.base+"-"),true);
    const original=masters.get(v.base);
    assert.ok(original);
    const bytes=await fs.readFile(path.join(hair,id+".webp"));
    assert.equal(hash(bytes),v.sha256);
    assert.equal(bytes.length,v.bytes);
    assert.ok(bytes.length<=180*1024,id+": candidate exceeds mobile source budget");
    const raster=await decode(bytes);
    let changed=0, locked=0, opaque=0, transparent=0;
    for(let p=0;p<512*512;p++) {
      const i=p*4;
      let different=false;
      for(let c=0;c<4;c++) if(raster[i+c]!==original.master[i+c]) different=true;
      if(original.lock[p]) {assert.ok(!different,id+": locked facial pixel changed at "+p); locked++;}
      if(different) changed++;
      if(raster[i+3]===255)opaque++;
      if(raster[i+3]===0)transparent++;
      if(p<512*5)assert.equal(raster[i+3],0,id+": top clearance");
    }
    assert.equal(locked,original.count);
    assert.ok(changed>5000 && opaque>80000 && transparent>50000,id+": insufficient visible artwork or variation");
    await tile(bytes,original.row,id.endsWith("short")||id.endsWith("bob")?1:2,id);
    cases.push({id,locked,changed,opaque,transparent,bytes:bytes.length});
  }
  await sharp({create:{width:768,height:564,channels:3,background:"#E9E1F3"}})
    .composite(tiles).png().toFile(path.join(output,"independent-hairstyle-review.png"));
  console.log("INDEPENDENT_HAIRSTYLE_PROOF "+JSON.stringify({cases:cases.length,lockedPixels:cases.reduce((n,c)=>n+c.locked,0),visualAcceptance:"NOT_APPROVED"}));
  return {cases,visualAcceptance:"NOT_APPROVED",runtimeRegistration:false};
}
