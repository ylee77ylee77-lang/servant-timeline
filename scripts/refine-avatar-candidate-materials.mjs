/**
 * Candidate-only source-aware edge refinement of the pinned initial RGB masks.
 * Does not modify the original portrait, hair ownership, production catalog,
 * or runtime color transfer. All geometry is on the 512px source artboard.
 */
import assert from "node:assert/strict";
import sharp from "sharp";
const SIZE = 512;
const smooth = (a,b,x) => { const t=Math.max(0,Math.min(1,(x-a)/(b-a))); return t*t*(3-2*t); };
const geometry = {
  "male-b": {
    eyeBoxes: [[166,186,243,225],[272,185,350,225]],
    eyeCore: ["M174 207Q190 193 209 194Q225 194 234 208L236 214Q220 218 207 217Q187 216 174 207Z","M278 213Q287 195 304 194Q323 193 340 204L343 208Q330 216 308 217Q291 217 278 213Z"],
    lipBox: [202,290,312,326],
    lipCore: "M205 299Q225 305 253 304Q282 305 306 298L307 301Q282 314 255 315Q229 314 205 301Z",
    protected: [[210,205],[306,205],[205,173],[309,172],[255,307],[256,485],[110,480],[404,475]],
  },
  "female-b": {
    eyeBoxes: [[166,188,242,234],[270,187,352,234]],
    eyeCore: ["M171 214Q186 197 207 198Q225 199 234 220L236 225Q223 228 209 228Q188 227 171 214Z","M278 225Q284 204 305 198Q325 197 344 209L347 211Q332 226 309 228Q292 228 278 225Z"],
    lipBox: [206,292,307,328],
    lipCore: "M212 300Q233 304 245 302Q254 302 264 301Q281 304 300 298L300 303Q283 318 255 321Q229 317 212 303Z",
    protected: [[209,216],[306,216],[205,177],[308,177],[255,310],[256,487],[115,480],[397,480]],
  },
};
const inBox = (x,y,[l,t,r,b]) => x>=l && x<=r && y>=t && y<=b;
const boxFade = (x,y,[l,t,r,b]) => smooth(0,3,Math.min(x-l,r-x,y-t,b-y));
async function coverage(paths) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="black"/>${paths.map(d=>`<path d="${d}" fill="white"/>`).join("")}</svg>`;
  return sharp(Buffer.from(svg)).removeAlpha().raw().toBuffer();
}

export async function refineCandidateMaterial(id, art, initial) {
  assert.ok(Object.hasOwn(geometry,id), "Unregistered candidate");
  const g = geometry[id];
  const source = await sharp(art).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const mask = await sharp(initial).removeAlpha().raw().toBuffer({resolveWithObject:true});
  assert.deepEqual([source.info.width,source.info.height,source.info.channels],[SIZE,SIZE,4]);
  assert.deepEqual([mask.info.width,mask.info.height,mask.info.channels],[SIZE,SIZE,3]);
  const eyes=await coverage(g.eyeCore), lips=await coverage([g.lipCore]);
  const out=Buffer.from(mask.data);
  let restoredEye=0, restoredLip=0;
  for(let y=0;y<SIZE;y++) for(let x=0;x<SIZE;x++) {
    const i=(y*SIZE+x)*3, j=(y*SIZE+x)*4;
    if(source.data[j+3]<200 || out[i]!==0 || out[i+2]!==0) continue;
    const [r,green,b]=source.data.subarray(j,j+3);
    const lum=.2126*r+.7152*green+.0722*b;
    let restore=0, part="";
    // Local geometry and warm source color must both identify skin. Dark
    // lashes/iris and low-chroma sclera retain their original pixels.
    for(const box of g.eyeBoxes) if(inBox(x,y,box)) {
      restore=Math.max(restore,boxFade(x,y,box)*(1-eyes[i]/255)*smooth(26,53,r-green)*smooth(110,158,lum));
      part="eye";
    }
    if(inBox(x,y,g.lipBox)) {
      // These closed-mouth sources have no exposed teeth. Graded lip-edge
      // ownership avoids a pale outline without erasing the mouth shape.
      const core=lips[i]/255;
      const warm=smooth(24,48,r-green)*smooth(85,130,lum);
      restore=boxFade(x,y,g.lipBox)*warm*(1-.38*core);
      part="lip";
    }
    if(!part) continue;
    let guard=1;
    for(const [px,py] of g.protected) guard=Math.min(guard,smooth(1,6,Math.max(Math.abs(x-px),Math.abs(y-py))));
    const proposed=Math.round(255*restore*guard);
    if(proposed>out[i+1]) {
      out[i+1]=proposed;
      if(part==="eye") restoredEye++; else restoredLip++;
    }
  }
  // Verify that only skin ownership increased, and only within the local
  // feature envelopes. The initial mask remains pinned as a control.
  let changed=0;
  for(let y=0;y<SIZE;y++) for(let x=0;x<SIZE;x++) {
    const i=(y*SIZE+x)*3;
    assert.equal(out[i],mask.data[i]);
    assert.equal(out[i+2],mask.data[i+2]);
    assert.ok(out[i+1]>=mask.data[i+1]);
    if(out[i+1]===mask.data[i+1]) continue;
    changed++;
    assert.ok(g.eyeBoxes.some(box=>inBox(x,y,box))||inBox(x,y,g.lipBox));
    assert.ok(out[i]+out[i+1]+out[i+2]<=255);
  }
  assert.equal(changed,restoredEye+restoredLip);
  assert.ok(restoredEye>200 && restoredLip>500, id+": no meaningful feature-edge refinement");
  const png=await sharp(out,{raw:{width:SIZE,height:SIZE,channels:3}}).png({compressionLevel:9}).toBuffer();
  return {png,restoredEye,restoredLip};
}
