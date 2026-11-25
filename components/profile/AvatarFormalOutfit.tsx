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
      <linearGradient id={id + "-raised"} x1="0" y1="0" x2=".65" y2="1">
        <stop offset="0" stopColor={shades.dark} />
        <stop offset=".16" stopColor={shades.edge} />
        <stop offset=".42" stopColor={shades.light} />
        <stop offset=".76" stopColor={shades.mid} />
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
function Fold({ d, edge, id, shades, raised = false }: { d: string; edge: string; id: string; shades: Shade; raised?: boolean }) {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      {/* Stronger contact shadows and lit turned edges on collars/lapels only. */}
      <path d={d} transform={raised ? "translate(1 7)" : "translate(1 4)"} fill={shades.deep} stroke={shades.deep} strokeWidth={raised ? 7 : 5} opacity={raised ? .38 : .26} />
      <path d={d} fill={paint(id + (raised ? "-raised" : "-fold"))} stroke={shades.dark} strokeWidth={raised ? 2 : 1.3} />
      <path d={edge} fill="none" stroke={shades.deep} strokeWidth={raised ? 6 : 4.4} opacity={raised ? .58 : .46} />
      <path d={edge} transform={raised ? "translate(0 -2)" : "translate(0 -1.4)"} fill="none" stroke={paint(id + "-edge")} strokeWidth={raised ? 3.3 : 2.3} />
      <path d={edge} transform={raised ? "translate(0 -4.6)" : "translate(0 -3.4)"} fill="none" stroke={shades.edge} strokeWidth={raised ? 1.8 : 1} opacity={raised ? .72 : .48} />
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
  const satin = plan.id === "formal-dress";
  const weaveId = id + "-weave";
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
        {/* Restrained, palette-derived textile direction; no external images. */}
        {!satin && (
          <pattern id={weaveId} patternUnits="userSpaceOnUse" width="12" height="12" patternTransform={jacket ? "rotate(35)" : undefined}>
            <path d="M1 0V12" stroke={primary.deep} strokeWidth="1" opacity=".15" />
            <path d="M3 0V12" stroke={primary.edge} strokeWidth=".8" opacity=".2" />
          </pattern>
        )}
        {satin && (
          <linearGradient id={id + "-satin-sheen"} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor={primary.light} stopOpacity="0" />
            <stop offset=".43" stopColor={primary.edge} stopOpacity=".09" />
            <stop offset=".58" stopColor={primary.edge} stopOpacity=".18" />
            <stop offset=".73" stopColor={primary.light} stopOpacity="0" />
          </linearGradient>
        )}
      </defs>
      <path d={body} fill={paint(mainId)} />
      <g clipPath={paint(id + "-body")}>
        <path d={body} fill={paint(satin ? id + "-satin-sheen" : weaveId)} />
        <path d="M-8 515Q50 442 159 429Q109 455 91 512Z" fill={primary.light} opacity=".15" />
        <path d="M361 422Q469 449 524 512H430Q431 475 361 422Z" fill={primary.deep} opacity=".13" />
        <Seams male={male} shades={primary} />
        {male ? (
          <>
            {jacket && <path d={open ? "M183 388L259 424L342 388L313 460L288 512H225L203 459Z" : "M189 388L259 424L338 388L309 466L289 512H223L211 466Z"} fill={paint(innerId)} />}
            {open ? (
              <>
                {/* Casual blazer: a clean knit inner layer, not a second buttoned shirt. */}
                <path d="M183 389Q259 456 342 389L347 400Q260 468 177 401Z" fill={paint(innerId + "-fold")} />
                <path d="M187 398Q260 462 339 398" fill="none" stroke={inner.deep} strokeWidth="4" opacity=".32" />
                <path d="M192 399Q261 458 335 399" fill="none" stroke={inner.edge} strokeWidth="1.8" opacity=".67" />
              </>
            ) : (
              <>
                <path d="M181 389Q259 449 346 388L350 403Q261 462 176 404Z" fill={collar.deep} opacity=".43" />
                <path d="M253 428Q262 433 270 427L272 512H248Z" fill={paint(collarId + "-fold")} />
                <path d="M249 450L248 512M270 451L272 512" stroke={collar.dark} strokeWidth="1.25" opacity=".42" />
              </>
            )}
            {plan.id === "suit-tie" ? (
              <g strokeLinejoin="round">
                <path d="M250 442L268 442L284 512H234Z" fill={tie.deep} opacity=".38" transform="translate(2 3)" />
                <path d="M250 441L267 441L282 512H235Z" fill={paint(tieId)} stroke={tie.dark} strokeWidth="1.2" />
                <path d="M253 448L245 512" stroke={tie.light} strokeWidth="2.3" opacity=".43" fill="none" />
                <path d="M245 425Q259 421 272 425L278 440Q269 450 260 453Q249 450 241 441Z" fill={paint(tieId + "-fold")} stroke={tie.deep} strokeWidth="1.15" />
                <path d="M247 428Q260 425 270 428" stroke={tie.edge} strokeWidth="1.5" fill="none" opacity=".7" />
              </g>
            ) : !open ? (
              <>
                <Button cx={261} cy={466} shades={collar} />
                <Button cx={261} cy={496} shades={collar} />
              </>
            ) : null}
            {!open && (
              <>
                <Fold raised d="M189 388Q218 409 258 426L224 466Q192 447 164 410Z" edge="M164 410Q192 447 224 466L258 426" id={collarId} shades={collar} />
                <Fold raised d="M338 388Q309 409 261 426L295 466Q331 445 357 409Z" edge="M357 409Q331 445 295 466L261 426" id={collarId} shades={collar} />
              </>
            )}
            {jacket && (
              <>
                <Fold raised d="M189 388Q157 402 126 426L176 442L151 467Q193 494 232 512H257Q231 472 215 443Z" edge="M126 426L176 442L151 467Q193 494 232 512" id={mainId} shades={primary} />
                <Fold raised d="M338 388Q372 402 401 426L348 442L375 467Q331 494 294 512H268Q289 473 306 443Z" edge="M401 426L348 442L375 467Q331 494 294 512" id={mainId} shades={primary} />
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
            <Fold raised d="M210 408Q177 419 149 434L198 450L175 476Q213 496 245 512H270Q251 472 238 456Z" edge="M149 434L198 450L175 476Q213 496 245 512" id={mainId} shades={primary} />
            <Fold raised d="M344 407Q377 417 405 433L353 451L376 476Q340 496 309 512H281Q299 474 316 454Z" edge="M405 433L353 451L376 476Q340 496 309 512" id={mainId} shades={primary} />
            <path d="M355 480L401 484" stroke={primary.deep} strokeWidth="6" opacity=".3" strokeLinecap="round" />
            <path d="M355 478L401 482" stroke={paint(mainId + "-fold")} strokeWidth="4" strokeLinecap="round" />
            <path d="M355 477L400 481" stroke={primary.edge} strokeWidth="1" opacity=".6" strokeLinecap="round" />
          </>
        ) : plan.id === "blouse" ? (
          <>
            <path d="M267 437Q276 442 284 437L288 512H263Z" fill={paint(mainId + "-fold")} />
            <path d="M264 458L263 512M286 458L288 512" stroke={primary.dark} opacity=".45" strokeWidth="1.3" />
            <Fold raised d="M210 408Q236 425 274 438Q262 458 240 473Q213 469 179 430Z" edge="M179 430Q213 469 240 473Q262 458 274 438" id={mainId} shades={primary} />
            <Fold raised d="M344 407Q318 427 278 438Q289 458 311 473Q341 468 373 429Z" edge="M373 429Q341 468 311 473Q289 458 278 438" id={mainId} shades={primary} />
            <Button cx={276} cy={477} shades={primary} radius={4.1} />
            <Button cx={276} cy={503} shades={primary} radius={4.1} />
            <path d="M139 451Q164 462 177 486M410 451Q389 461 375 486" fill="none" stroke={primary.edge} strokeWidth="1.6" opacity=".34" strokeLinecap="round" />
          </>
        ) : (
          <>
            {/* Asymmetric wrap dress with broad overlapping satin folds,
                positioned high enough to be visible inside the round crop. */}
            <path d="M201 413Q237 437 276 439Q312 435 349 407L367 423Q324 455 283 470L222 512H170Q215 470 254 455Q220 444 189 432Z" fill={primary.deep} opacity=".28" />
            <Fold d="M210 408Q240 434 277 440Q315 434 344 407L360 421Q324 455 283 468Q243 455 193 425Z" edge="M193 425Q239 454 283 468Q325 454 360 421" id={mainId} shades={primary} />
            <path d="M349 421C324 449 294 464 262 476Q218 491 194 512H332Q342 473 349 421Z" fill={primary.deep} opacity=".45" />
            <path d="M355 420C325 448 295 460 266 470Q223 485 202 512H331Q340 472 355 420Z" fill={paint(mainId + "-fold")} />
            <path d="M353 424C325 451 294 464 266 474Q226 488 205 512" fill="none" stroke={primary.edge} strokeWidth="3.1" opacity=".76" strokeLinecap="round" />
            <path d="M343 441Q315 474 279 485Q249 497 236 512M340 455Q320 484 292 496" fill="none" stroke={primary.dark} strokeWidth="3.2" opacity=".42" strokeLinecap="round" />
            <path d="M343 438Q315 471 279 482Q249 494 236 510" fill="none" stroke={primary.light} strokeWidth="1.8" opacity=".55" strokeLinecap="round" />
          </>
        )}
      </g>
    </g>
  );
}
