import { outfitShades, type getAvatarFormalOutfitPlan } from "@/lib/profile/avatar-formal-outfit";
import { AVATAR_CANVAS_SIZE, AVATAR_PORTRAIT_BOUNDS } from "@/lib/profile/avatar-scene";

type Plan = NonNullable<ReturnType<typeof getAvatarFormalOutfitPlan>>;
type Shade = ReturnType<typeof outfitShades>;
function Fabric({ id, shades }: { id: string; shades: Shade }) {
  return (
    <>
      <linearGradient id={id} x1="0" y1="0" x2=".87" y2="1">
        <stop offset="0" stopColor={shades.light} /><stop offset=".43" stopColor={shades.mid} />
        <stop offset=".78" stopColor={shades.dark} /><stop offset="1" stopColor={shades.deep} />
      </linearGradient>
      <linearGradient id={id+"-lapel"} x1="0" y1="0" x2=".72" y2="1">
        <stop offset="0" stopColor={shades.light} /><stop offset=".55" stopColor={shades.mid} /><stop offset="1" stopColor={shades.dark} />
      </linearGradient>
    </>
  );
}
/** Only clothing is drawn here. The shared renderer draws the clipped
 * original head above this independent garment, followed by accessories.
 * The artwork is shaded 2D vector art, not a recovered 3D garment mesh. */
export function AvatarFormalOutfitArtwork({ plan, id }: { plan: Plan; id: string }) {
  const { x,y,size } = AVATAR_PORTRAIT_BOUNDS;
  const primary=outfitShades(plan.colors.clothing ?? "#465B6E");
  const inner=outfitShades(plan.colors.lining ?? plan.colors.clothing ?? "#EEF1F4");
  const tie=outfitShades(plan.colors.tie ?? "#943F56");
  const mainId=id+"-main", innerId=id+"-inner", tieId=id+"-tie";
  const fill=(s:string)=>`url(#${s})`;
  const male=plan.style==="masculine";
  const jacket=plan.id==="suit-tie"||plan.id==="blazer"||plan.id==="tailored-suit";
  const body=male
    ? "M0 512Q11 457 58 437Q118 410 189 388L259 424L338 388Q409 410 461 440Q500 465 512 512Z"
    : "M18 512Q28 467 76 444Q141 415 210 408L276 436L344 407Q415 423 457 450Q490 476 500 512Z";
  return (
    <g aria-hidden="true" transform={`translate(${x} ${y}) scale(${size/AVATAR_CANVAS_SIZE})`}>
      <defs>
        <Fabric id={mainId} shades={primary}/><Fabric id={innerId} shades={inner}/><Fabric id={tieId} shades={tie}/>
      </defs>
      <path d={body} fill={fill(mainId)}/>
      {male ? (
        <>
          {jacket ? <path d="M189 388L259 424L338 388L308 466L289 512H223L211 466Z" fill={fill(innerId)}/> : null}
          <path d="M189 388L259 424L230 453L168 410Z" fill={fill((jacket?innerId:mainId)+"-lapel")} stroke={jacket?inner.dark:primary.dark} strokeWidth="1.2" strokeLinejoin="round"/>
          <path d="M338 388L259 424L288 453L353 409Z" fill={fill((jacket?innerId:mainId)+"-lapel")} stroke={jacket?inner.dark:primary.dark} strokeWidth="1.2" strokeLinejoin="round"/>
          {plan.id==="suit-tie" ? (
            <g fill={fill(tieId)} stroke={tie.deep} strokeWidth="1.1" strokeLinejoin="round">
              <path d="M250 444L267 444L282 512H235Z"/>
              <path d="M245 425L272 425L278 441L260 453L241 442Z"/>
              <path d="M247 428L268 428" fill="none" stroke={tie.edge} opacity=".4"/>
            </g>
          ) : <g stroke={jacket?inner.dark:primary.dark} strokeWidth="1.5" opacity=".65">
            <path d="M260 428V512"/><circle cx="265" cy="474" r="2.5" fill={jacket?inner.light:primary.light}/>
            <circle cx="265" cy="502" r="2.5" fill={jacket?inner.light:primary.light}/>
          </g>}
          {jacket ? (
            <>
              <path d="M189 388L131 427L175 442L155 466L231 512H252L215 452Z" fill={fill(mainId+"-lapel")} stroke={primary.dark} strokeWidth="1.4" strokeLinejoin="round"/>
              <path d="M338 388L395 427L351 442L370 466L294 512H271L307 452Z" fill={fill(mainId+"-lapel")} stroke={primary.dark} strokeWidth="1.4" strokeLinejoin="round"/>
              <path d="M346 472L397 477" stroke={primary.deep} strokeWidth="4" strokeLinecap="round"/>
              <path d="M346 470L397 475" stroke={primary.light} strokeWidth="1.5" strokeLinecap="round" opacity=".5"/>
            </>
          ) : null}
          <path d="M62 441Q107 442 134 512M460 442Q417 449 392 512" stroke={primary.deep} strokeWidth="2" opacity=".3" fill="none"/>
        </>
      ) : jacket ? (
        <>
          <path d="M210 408L276 436L344 407L315 512H235Z" fill={fill(innerId)}/>
          <path d="M210 408L153 434L197 450L182 471L245 512H268L238 458Z" fill={fill(mainId+"-lapel")} stroke={primary.dark} strokeWidth="1.2" strokeLinejoin="round"/>
          <path d="M344 407L399 433L353 451L369 470L309 512H283L316 455Z" fill={fill(mainId+"-lapel")} stroke={primary.dark} strokeWidth="1.2" strokeLinejoin="round"/>
          <path d="M208 410L276 437L344 409" stroke={inner.dark} strokeWidth="2" opacity=".45" fill="none"/>
          <path d="M356 480L402 484" stroke={primary.deep} strokeWidth="3" strokeLinecap="round"/>
        </>
      ) : plan.id==="blouse" ? (
        <>
          <path d="M210 408L276 436L244 462L185 430Z" fill={fill(mainId+"-lapel")} stroke={primary.dark} strokeWidth="1.2" strokeLinejoin="round"/>
          <path d="M344 407L276 436L304 462L368 429Z" fill={fill(mainId+"-lapel")} stroke={primary.dark} strokeWidth="1.2" strokeLinejoin="round"/>
          <path d="M276 440V512" stroke={primary.dark} strokeWidth="1.5" opacity=".6"/>
          {[477,505].map(y=><circle key={y} cx="280" cy={y} r="2.8" fill={primary.light} stroke={primary.dark} strokeWidth=".6"/>)}
        </>
      ) : (
        <>
          <path d="M210 408Q232 444 276 445Q319 444 344 407L358 419Q324 459 276 461Q225 459 196 420Z" fill={fill(mainId+"-lapel")} stroke={primary.dark} strokeWidth="1.2" strokeLinejoin="round"/>
          <path d="M199 421Q226 457 276 458Q324 457 356 420" fill="none" stroke={primary.edge} strokeWidth="1.5" opacity=".5"/>
          <path d="M151 445Q176 475 182 512M400 445Q376 475 370 512" fill="none" stroke={primary.dark} strokeWidth="2.2" opacity=".5"/>
        </>
      )}
    </g>
  );
}
