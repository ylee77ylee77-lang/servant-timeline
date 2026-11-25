/** Candidate-only fitting of three existing frame styles to the new B faces.
 * All coordinates refer to the unscaled 512px source artboard. No runtime
 * catalog entry; the existing AvatarEyewear component renders these plans.
 */
export const B_EYEWEAR_FITS = {
  'male-b': { eyes: [[210,205],[306,205]], temples: [[145,193],[370,193]], original: '#3B3935' },
  'female-b': { eyes: [[209,216],[306,216]], temples: [[144,205],[371,205]], original: '#3A3732' },
};
export const B_EYEWEAR_CHOICES = ['classic','round','square'];
function rim(x,y,choice) {
  const p=(dx,dy)=>`${x+dx} ${y+dy}`;
  if(choice==='round')return `M${p(-37,0)} C${p(-37,-22)} ${p(-21,-33)} ${p(0,-33)} C${p(21,-33)} ${p(37,-22)} ${p(37,0)} C${p(37,22)} ${p(21,33)} ${p(0,33)} C${p(-21,33)} ${p(-37,22)} ${p(-37,0)} Z`;
  if(choice==='square')return `M${p(-29,-28)} H${x+29} Q${p(41,-28)} ${p(41,-16)} L${p(38,17)} Q${p(37,29)} ${p(25,29)} H${x-25} Q${p(-37,29)} ${p(-38,17)} L${p(-41,-16)} Q${p(-41,-28)} ${p(-29,-28)} Z`;
  return `M${p(-41,-15)} C${p(-41,-28)} ${p(-19,-29)} ${p(0,-29)} C${p(20,-29)} ${p(41,-25)} ${p(41,-14)} C${p(41,9)} ${p(32,27)} ${p(0,28)} C${p(-28,28)} ${p(-39,16)} ${p(-41,-15)} Z`;
}
export function getCandidateEyewearPlan(base,choice,color,occlusionUri) {
  const fit=Object.hasOwn(B_EYEWEAR_FITS,base)?B_EYEWEAR_FITS[base]:null;
  if(!fit||!B_EYEWEAR_CHOICES.includes(choice))throw new Error('Unregistered candidate eyewear');
  if(color!==undefined&&!/^#[0-9A-F]{6}$/i.test(color))throw new Error('Invalid frame color');
  const [[lx,ly],[rx,ry]]=fit.eyes;
  const [[ltx,lty],[rtx,rty]]=fit.temples;
  const edge=choice==='round'?35:41, yOffset=choice==='round'?-10:-14;
  return { original:fit.original,color:color??fit.original,choice,artwork:'stroke',occlusionUri,geometry:{
    rims:[rim(lx,ly,choice),rim(rx,ry,choice)],
    bridge:`M${lx+edge} ${ly+yOffset} Q${(lx+rx)/2} ${(ly+ry)/2+yOffset-6} ${rx-edge} ${ry+yOffset}`,
    temples:[`M${ltx} ${lty} L${lx-edge} ${ly+yOffset}`,`M${rx+edge} ${ry+yOffset} L${rtx} ${rty}`],
    width:choice==='round'?5.5:choice==='square'?6.4:5.8,
  }};
}
