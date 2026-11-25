import { outfitShades, type getAvatarFormalOutfitPlan } from "@/lib/profile/avatar-formal-outfit";
import { AVATAR_CANVAS_SIZE, AVATAR_PORTRAIT_BOUNDS } from "@/lib/profile/avatar-scene";

type Plan = NonNullable<ReturnType<typeof getAvatarFormalOutfitPlan>>;
type Shade = ReturnType<typeof outfitShades>;
const paint = (id: string) => `url(#${id})`;

function Fabric({ id, shades }: { id: string; shades: Shade }) {
  return (
    <>
      <radialGradient id={id} cx="29%" cy="13%" r="102%">
        <stop offset="0" stopColor={shades.light} />
        <stop offset=".39" stopColor={shades.mid} />
        <stop offset=".78" stopColor={shades.dark} />
        <stop offset="1" stopColor={shades.deep} />
      </radialGradient>
      <linearGradient id={id + "-fold"} x1="0" y1="0" x2=".85" y2="1">
        <stop offset="0" stopColor={shades.dark} />
        <stop offset=".19" stopColor={shades.light} />
        <stop offset=".42" stopColor={shades.mid} />
        <stop offset=".82" stopColor={shades.mid} />
        <stop offset="1" stopColor={shades.dark} />
      </linearGradient>
      <linearGradient id={id + "-edge"} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={shades.edge} />
        <stop offset=".48" stopColor={shades.mid} />
        <stop offset="1" stopColor={shades.deep} />
      </linearGradient>
    </>
  );
}

/** Raised fabric fold: contact shadow, modeled face, and turned edge.
 * All colors derive from the independently adjustable material palette. */
function Fold({ d, edge, id, shades }: { d: string; edge: string; id: string; shades: Shade }) {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <path d={d} transform="translate(1 4)" fill={shades.deep} stroke={shades.deep} strokeWidth="5" opacity=".26" />
      <path d={d} fill={paint(id + "-fold")} stroke={shades.dark} strokeWidth="1.3" />
      <path d={edge} fill="none" stroke={shades.deep} strokeWidth="4.4" opacity=".46" />
      <path d={edge} transform="translate(0 -1.4)" fill="none" stroke={paint(id + "-edge")} strokeWidth="2.3" />
      <path d={edge} transform="translate(0 -3.4)" fill="none" stroke={shades.edge} strokeWidth="1" opacity=".48" />
    </g>
  );
}

function Button({ cx, cy, shades, radius = 3.8 }: { cx: number; cy: number; shades: Shade; radius?: number }) {
  return (
    <g>
      <circle cx={cx + .8} cy={cy + 1.7} r={radius + .7} fill={shades.deep} opacity=".4" />
      <circle cx={cx} cy={cy} r={radius} fill={shades.mid} stroke={shades.dark} strokeWidth=".7" />
      <path d={`M${cx - radius * .52} ${cy - radius * .4}Q${cx} ${cy - radius * .92} ${cx + radius * .52} ${cy - radius * .4}`} stroke={shades.edge} strokeWidth="1.1" fill="none" strokeLinecap="round" />
      <circle cx={cx - 1} cy={cy + .5} r=".65" fill={shades.deep} />
      <circle cx={cx + 1} cy={cy + .5} r=".65" fill={shades.deep} />
    </g>
  );
}

function Seams({ shades, male }: { shades: Shade; male: boolean }) {
  return (
    <g fill="none" strokeLinecap="round">
      <path d={male ? "M66 438Q111 440 133 512M452 438Q413 448 393 512" : "M83 444Q126 448 145 512M442 443Q408 455 387 512"} stroke={shades.deep} strokeWidth="4" opacity=".19" />
      <path d={male ? "M68 437Q112 439 135 512M450 437Q411 448 391 512" : "M85 443Q127 447 147 512M440 443Q407 455 385 512"} stroke={shades.edge} strokeWidth="1.6" opacity=".32" />
    </g>
  );
}

/** Garment-only artwork aligned to the pinned 512px portrait sources.
 * The source head/hair/neck is composed independently above it. This is
 * dimensionally shaded 2D artwork, not a rigged 3D garment mesh. */
export function AvatarFormalOutfitArtwork({ plan, id }: { plan: Plan; id: string }) {
  const { x, y, size } = AVATAR_PORTRAIT_BOUNDS;
  const primary = outfitShades(plan.colors.clothing ?? "#465B6E");
  const inner = outfitShades(plan.colors.lining ?? plan.colors.clothing ?? "#EEF1F4");
  const tie = outfitShades(plan.colors.tie ?? "#943F56");
  const mainId = id + "-main", innerId = id + "-inner", tieId = id + "-tie";
  const male = plan.style === "masculine";
  const jacket = plan.id === "suit-tie" || plan.id === "blazer" || plan.id === "tailored-suit";
  const open = plan.id === "blazer";
  const collar = jacket ? inner : primary;
  const collarId = jacket ? innerId : mainId;
  const body = male
    ? "M0 512C7 471 27 448 63 435C112 415 159 408 189 388L259 424L338 388C372 411 420 415 460 439C488 457 505 480 512 512Z"
    : "M18 512C28 474 50 453 83 441C133 423 177 419 210 408L276 436L344 407C388 422 424 432 457 450C482 466 494 488 500 512Z";
  return (
    <g aria-hidden="true" transform={`translate(${x} ${y}) scale(${size / AVATAR_CANVAS_SIZE})`}>
      <defs>
        <Fabric id={mainId} shades={primary} /><Fabric id={innerId} shades={inner} /><Fabric id={tieId} shades={tie} />
        <clipPath id={id + "-body"}><path d={body} /></clipPath>
      </defs>
      <path d={body} fill={paint(mainId)} />
      <g clipPath={paint(id + "-body")}>
        <path d="M-8 515Q50 442 159 429Q109 455 91 512Z" fill={primary.light} opacity=".15" />
        <path d="M361 422Q469 449 524 512H430Q431 475 361 422Z" fill={primary.deep} opacity=".13" />
        <Seams male={male} shades={primary} />
        {male ? (
          <>
            {jacket && <path d={open ? "M183 388L259 424L342 388L313 460L288 512H225L203 459Z" : "M189 388L259 424L338 388L309 466L289 512H223L211 466Z"} fill={paint(innerId)} />}
            <path d="M181 389Q259 449 346 388L349 400Q261 458 177 401Z" fill={collar.deep} opacity=".34" />
            <path d="M253 428Q262 433 270 427L272 512H248Z" fill={paint(collarId + "-fold")} />
            <path d="M249 450L248 512M270 451L272 512" stroke={collar.dark} strokeWidth="1.25" opacity=".42" />
            {plan.id === "suit-tie" ? (
              <g strokeLinejoin="round">
                <path d="M250 442L268 442L284 512H234Z" fill={tie.deep} opacity=".38" transform="translate(2 3)" />
                <path d="M250 441L267 441L282 512H235Z" fill={paint(tieId)} stroke={tie.dark} strokeWidth="1.2" />
                <path d="M253 448L245 512" stroke={tie.light} strokeWidth="2.3" opacity=".43" fill="none" />
                <path d="M245 425Q259 421 272 425L278 440Q269 450 260 453Q249 450 241 441Z" fill={paint(tieId + "-fold")} stroke={tie.deep} strokeWidth="1.15" />
                <path d="M247 428Q260 425 270 428" stroke={tie.edge} strokeWidth="1.5" fill="none" opacity=".7" />
              </g>
            ) : (
              <>
                <Button cx={261} cy={open ? 477 : 466} shades={collar} />
                <Button cx={261} cy={open ? 503 : 496} shades={collar} />
              </>
            )}
            <Fold d={open ? "M189 388Q209 410 253 432L225 463Q197 444 167 411Z" : "M189 388Q218 409 258 426L230 453Q200 437 168 410Z"} edge={open ? "M168 411Q198 445 225 463L253 432" : "M169 410Q199 438 230 453L258 426"} id={collarId} shades={collar} />
            <Fold d={open ? "M338 388Q310 413 265 432L294 463Q327 442 356 410Z" : "M338 388Q309 409 261 426L288 453Q324 436 353 409Z"} edge={open ? "M356 410Q326 443 294 463L265 432" : "M353 409Q324 436 288 453L261 426"} id={collarId} shades={collar} />
            {jacket && (
              <>
                <Fold d="M189 388Q159 402 131 425L173 441L154 463Q193 490 232 512H254Q229 472 212 444Z" edge="M132 425L173 441L154 463Q194 490 232 512" id={mainId} shades={primary} />
                <Fold d="M338 388Q369 402 395 425L352 441L371 464Q331 490 294 512H271Q290 474 310 444Z" edge="M395 425L352 441L371 464Q332 490 294 512" id={mainId} shades={primary} />
                <path d="M345 472L395 478" stroke={primary.deep} strokeWidth="7" opacity=".32" strokeLinecap="round" />
                <path d="M346 470L395 476" stroke={paint(mainId + "-fold")} strokeWidth="5" strokeLinecap="round" />
                <path d="M346 469L395 475" stroke={primary.edge} strokeWidth="1.1" opacity=".5" strokeLinecap="round" />
              </>
            )}
          </>
        ) : plan.id === "tailored-suit" ? (
          <>
            <path d="M208 408L276 436L346 407L317 512H233Z" fill={paint(innerId)} />
            <path d="M210 410Q276 451 344 409" fill="none" stroke={inner.deep} strokeWidth="5" opacity=".32" />
            <path d="M210 408Q275 447 344 407" fill="none" stroke={inner.light} strokeWidth="3" opacity=".62" />
            <Fold d="M210 408Q178 419 153 434L198 450L180 472Q215 493 245 512H268Q249 472 238 458Z" edge="M153 434L198 450L180 472Q216 493 245 512" id={mainId} shades={primary} />
            <Fold d="M344 407Q376 417 399 433L353 451L371 472Q338 493 309 512H283Q301 474 316 455Z" edge="M399 433L353 451L371 472Q337 493 309 512" id={mainId} shades={primary} />
            <path d="M355 480L401 484" stroke={primary.deep} strokeWidth="6" opacity=".3" strokeLinecap="round" />
            <path d="M355 478L401 482" stroke={paint(mainId + "-fold")} strokeWidth="4" strokeLinecap="round" />
            <path d="M355 477L400 481" stroke={primary.edge} strokeWidth="1" opacity=".6" strokeLinecap="round" />
          </>
        ) : plan.id === "blouse" ? (
          <>
            <path d="M267 437Q276 442 284 437L288 512H263Z" fill={paint(mainId + "-fold")} />
            <path d="M264 458L263 512M286 458L288 512" stroke={primary.dark} opacity=".45" strokeWidth="1.3" />
            <Fold d="M210 408Q236 425 274 438Q262 452 245 462Q223 462 184 430Z" edge="M185 430Q221 462 245 462Q263 451 274 438" id={mainId} shades={primary} />
            <Fold d="M344 407Q318 427 278 438Q289 453 305 462Q331 459 368 429Z" edge="M368 429Q331 459 305 462Q289 453 278 438" id={mainId} shades={primary} />
            <Button cx={276} cy={477} shades={primary} radius={4.1} />
            <Button cx={276} cy={503} shades={primary} radius={4.1} />
            <path d="M139 451Q164 462 177 486M410 451Q389 461 375 486" fill="none" stroke={primary.edge} strokeWidth="1.6" opacity=".34" strokeLinecap="round" />
          </>
        ) : (
          <>
            {/* Sculpted neckline and overlapping satin panel. */}
            <path d="M196 419Q224 458 276 462Q325 458 358 419L365 428Q331 470 276 473Q219 470 189 429Z" fill={primary.deep} opacity=".28" />
            <Fold d="M210 408Q237 442 276 445Q317 443 344 407L359 419Q326 457 276 463Q226 458 196 420Z" edge="M196 420Q226 458 276 463Q326 457 359 419" id={mainId} shades={primary} />
            <path d="M349 435Q319 465 276 478Q225 492 188 512H316Q335 481 349 435Z" fill={primary.deep} opacity=".22" />
            <path d="M353 434Q319 464 281 478Q239 491 200 512H321Q340 481 353 434Z" fill={paint(mainId + "-fold")} />
            <path d="M350 440Q321 466 281 480Q237 494 205 512" fill="none" stroke={primary.edge} strokeWidth="2.1" opacity=".62" strokeLinecap="round" />
            <path d="M339 452Q312 480 275 489Q246 498 230 512M344 462Q325 490 293 500" fill="none" stroke={primary.dark} strokeWidth="2.1" opacity=".27" strokeLinecap="round" />
            <path d="M339 450Q312 478 275 487Q246 496 230 511" fill="none" stroke={primary.light} strokeWidth="1.3" opacity=".35" strokeLinecap="round" />
          </>
        )}
      </g>
    </g>
  );
}
