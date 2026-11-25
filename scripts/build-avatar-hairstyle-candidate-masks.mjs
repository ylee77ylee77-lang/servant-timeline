/** Candidate-only source-specific color coverage; never registers runtime assets. */
import assert from 'node:assert/strict';
import sharp from 'sharp';
const SIZE=512;
const maleBody='L361 207Q384 196 393 219Q401 254 376 279Q367 283 354 286Q348 322 334 345L334 402Q337 416 350 427Q337 447 311 459Q283 471 255 470Q222 470 190 457Q172 445 162 425Q177 411 179 402L181 345Q164 326 158 285Q138 282 128 256Q119 235 124 215Q130 199 143 208L153 227';
const femaleBody='L360 215Q375 215 383 233Q389 259 367 277L352 285Q340 315 312 341L309 382Q311 407 328 422L345 429Q332 449 308 459Q281 466 257 466Q230 466 205 455Q181 445 168 430L184 421Q199 406 202 383L201 340Q174 316 164 285Q144 277 135 253Q128 236 140 221L155 225';
const shapes={
 'male-b-short':{hair:'M0 0H512V196H403L391 212L367 231L360 255H153L145 225L124 211L105 192H0Z',skin:'M153 227L155 181Q167 158 181 149L191 164L205 147L218 151L235 132L245 143Q267 111 287 120Q316 109 340 121Q351 137 352 164L360 208'+maleBody+'Z'},
 'male-b-side':{hair:'M0 0H512V195H406L392 209L365 226L359 258H152L144 226L125 210L106 194H0Z',skin:'M153 227L155 179Q168 163 193 164Q219 160 234 137Q242 115 259 112Q293 100 327 110Q349 121 350 150L360 209'+maleBody+'Z'},
 'female-b-bob':{hair:'M0 0H512V399L382 401Q356 411 326 413Q306 413 296 398L204 400Q189 414 163 415Q134 414 109 400H0Z',skin:'M155 225Q173 203 188 178Q205 144 225 115Q245 102 266 103Q290 102 312 120Q336 145 350 177L360 215'+femaleBody+'Z'},
 'female-b-bun':{hair:'M0 0H512V375L384 375Q366 362 361 348Q366 325 380 302Q399 272 399 246L385 226L365 239L351 278L162 278L149 239L134 227L115 245Q116 278 136 305Q153 329 157 351L153 373H0Z',skin:'M155 225Q177 203 199 178Q220 138 244 115Q270 103 290 110Q318 123 336 150Q352 177 360 215'+femaleBody+'Z'}
};
const smooth=(a,b,x)=>{let t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export async function makeVariantMask(id,art,masterMask,lockBytes){
 assert.ok(Object.hasOwn(shapes,id));const {hair,skin}=shapes[id];
 const raw=await sharp(art).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const m=await sharp(masterMask).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const l=await sharp(lockBytes).greyscale().raw().toBuffer({resolveWithObject:true});
 assert.deepEqual([raw.info.width,raw.info.height,raw.info.channels],[SIZE,SIZE,4]);
 assert.deepEqual([m.info.width,m.info.height,m.info.channels],[SIZE,SIZE,3]);
 assert.deepEqual([l.info.width,l.info.height,l.info.channels],[SIZE,SIZE,1]);
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="black"/><path d="${hair}" fill="#ff0000"/><path d="${skin}" fill="#00ff00"/></svg>`;
 const pixels=await sharp(Buffer.from(svg)).removeAlpha().raw().toBuffer();
 const boundary=await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="black"/><path d="${skin}" fill="none" stroke="white" stroke-width="12"/></svg>`)).removeAlpha().raw().toBuffer();
 const blurred=await sharp(l.data,{raw:{width:512,height:512,channels:1}}).blur(5).greyscale().raw().toBuffer();
 let locked=0;
 for(let p=0;p<SIZE*SIZE;p++){
  const i=p*3,j=p*4;
  assert.ok(l.data[p]===0||l.data[p]===255);
  let h=pixels[i],s=pixels[i+1];
  const r=raw.data[j],g=raw.data[j+1];
  const edge=boundary[i]/255;
  // Warm light skin can replace hair ownership only in the traced boundary band.
  const warm=smooth(128,190,r)*smooth(22,48,r-g);
  const dark=(1-smooth(70,130,r))*(1-smooth(16,40,r-g));
  const toSkin=h*edge*warm, toHair=s*edge*dark;
  h=h-toSkin+toHair;s=s+toSkin-toHair;
  // Preserve the exact, already verified color ownership on the identical
  // face core; blend only outside it to the per-source traced coverage.
  const w=l.data[p]===255?1:Math.min(1,blurred[p]/120);
  if(l.data[p]===255)locked++;
  h=Math.round(h*(1-w)+m.data[i]*w);
  s=Math.round(s*(1-w)+m.data[i+1]*w);
  if(raw.data[j+3]===0){h=0;s=0;}
  pixels[i]=Math.min(255,h);pixels[i+1]=Math.min(255-pixels[i],s);pixels[i+2]=0;
  if(l.data[p]===255)assert.deepEqual([pixels[i],pixels[i+1],pixels[i+2]],[m.data[i],m.data[i+1],m.data[i+2]],id+': locked ownership changed');
 }
 assert.ok(locked>30000);
 const png=await sharp(pixels,{raw:{width:512,height:512,channels:3}}).png({compressionLevel:9}).toBuffer();
 return {png,locked};
}
