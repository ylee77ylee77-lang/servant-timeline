import { getAvatarEyewearShades, type getAvatarEyewearPlan, type getAvatarLensPlan } from "@/lib/profile/avatar-eyewear";
import { getAvatarLensShades } from "@/lib/profile/avatar-lens";
import { AVATAR_CANVAS_SIZE, AVATAR_PORTRAIT_BOUNDS } from "@/lib/profile/avatar-scene";

type EyewearPlan = NonNullable<ReturnType<typeof getAvatarEyewearPlan>>;

/** One independent accessory on the existing portrait artboard. */
export function AvatarEyewear({ plan, id }: { plan: EyewearPlan; id: string }) {
  const { x, y, size } = AVATAR_PORTRAIT_BOUNDS;
  const shades = getAvatarEyewearShades(plan.color);
  const gradientId = `${id}-rim`;
  const occlusionId = `${id}-hair-occlusion`;
  const paths = plan.artwork === "stroke" ? [...plan.geometry.temples, plan.geometry.bridge, ...plan.geometry.rims] : [];
  return (
    <g aria-hidden="true" transform={`translate(${x} ${y}) scale(${size / AVATAR_CANVAS_SIZE})`}>
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="0" y1="169" x2="0" y2="261">
          <stop offset="0" stopColor={shades.upper} />
          <stop offset=".24" stopColor={shades.mid} />
          <stop offset=".64" stopColor={shades.mid} />
          <stop offset="1" stopColor={shades.lower} />
        </linearGradient>
        {plan.occlusionUri ? (
          <filter id={occlusionId} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse"
            x={0} y={0} width={512} height={512} colorInterpolationFilters="sRGB">
            <feImage href={plan.occlusionUri} x={0} y={0} width={512} height={512} preserveAspectRatio="none" result="coverage" />
            <feColorMatrix in="coverage" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 1 0 0 0 0" result="hair" />
            <feComposite in="SourceGraphic" in2="hair" operator="out" />
          </filter>
        ) : null}
      </defs>
      <g filter={plan.occlusionUri ? `url(#${occlusionId})` : undefined}>
        {plan.artwork === "filled" ? (
          <g fill={`url(#${gradientId})`} stroke={shades.shadow} strokeWidth=".5" strokeLinejoin="round">
            {[...plan.geometry.temples, plan.geometry.bridge].map(d => <path key={d} d={d} />)}
            {plan.geometry.rings.map(ring => <path key={ring.outer} d={`${ring.outer} ${ring.lens}`} fillRule="evenodd" />)}
          </g>
        ) : (
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            <g stroke="#2C1D16" strokeWidth={plan.geometry.width + 1.4} opacity=".19" transform="translate(0 1.5)">
              {paths.map((d) => <path key={d} d={d} />)}
            </g>
            <g stroke={shades.shadow} strokeWidth={plan.geometry.width + 0.8}>
              {paths.map((d) => <path key={d} d={d} />)}
            </g>
            <g stroke={`url(#${gradientId})`} strokeWidth={plan.geometry.width}>
              {paths.map((d) => <path key={d} d={d} />)}
            </g>
            <g stroke={shades.highlight} strokeWidth="0.9" opacity=".35">
              {plan.geometry.rims.map((d) => <path key={d} d={d} />)}
            </g>
          </g>
        )}
      </g>
    </g>
  );
}

type LensPlan = NonNullable<ReturnType<typeof getAvatarLensPlan>>;

/** Independent tint beneath the vector rim; fully clear adds no artwork. */
export function AvatarLensArtwork({plan,id}:{plan:LensPlan;id:string}) {
  if (plan.opacity === 0) return null;
  const {x,y,size} = AVATAR_PORTRAIT_BOUNDS;
  const shades = getAvatarLensShades(plan.color);
  const gradientId = `${id}-tint`, occlusionId = `${id}-occlusion`;
  return (
    <g aria-hidden="true" transform={`translate(${x} ${y}) scale(${size/AVATAR_CANVAS_SIZE})`}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2=".18" y2="1">
          <stop offset="0" stopColor={shades.upper}/>
          <stop offset=".28" stopColor={shades.middle}/>
          <stop offset=".75" stopColor={shades.middle}/>
          <stop offset="1" stopColor={shades.lower}/>
        </linearGradient>
        {plan.occlusionUri && (
          <filter id={occlusionId} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse"
            x={0} y={0} width={512} height={512} colorInterpolationFilters="sRGB">
            <feImage href={plan.occlusionUri} x={0} y={0} width={512} height={512} preserveAspectRatio="none" result="coverage"/>
            {/* Red protects hair; blue additionally protects baked rims. */}
            <feColorMatrix in="coverage" type="matrix"
              values={`0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 1 0 ${plan.baked?1:0} 0 0`} result="protected"/>
            <feComposite in="SourceGraphic" in2="protected" operator="out"/>
          </filter>
        )}
      </defs>
      <g opacity={plan.opacity} filter={plan.occlusionUri?`url(#${occlusionId})`:undefined}>
        {plan.paths.map(d=><path key={d} d={d} fill={`url(#${gradientId})`}/>)}
      </g>
    </g>
  );
}
