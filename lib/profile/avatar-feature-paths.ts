/**
 * Protected facial features traced against the four original 512px v2 portraits.
 * Only sclera/iris, lip/mouth and actual brow/lash hairs belong in these holes;
 * eyelid skin, brow highlights on skin and the skin under a clear lens must tint.
 *
 * `eyes` and `mouth` are closed feature silhouettes. `brows` and `lashes` are
 * narrow hair envelopes: refine their antialiased coverage using SOURCE
 * luminance, rather than preserving every light pixel inside the envelope.
 * Otherwise pale skin between brow/lash hairs becomes a halo on deeper skin.
 * Paint these protected regions after hair ownership, then paint frame ownership.
 */
export type AvatarFeaturePoint = Readonly<{ x: number; y: number }>;
export type AvatarFeatureGeometry = Readonly<{
  source: string;
  sha256: string;
  eyes: readonly string[];
  brows: readonly string[];
  lashes: readonly string[];
  mouth: readonly string[];
  protectedPoints: readonly AvatarFeaturePoint[];
  /** Actual eyelid / brow-adjacent skin, outside the protected silhouettes. */
  skinPoints: readonly AvatarFeaturePoint[];
}>;

const MALE_FEATURES = {
  eyes: [
    "M179 205 C180 195 190 187 202 186 C219 184 230 194 232 210 L232 214 C222 219 198 222 184 214 C181 212 179 208 179 205 Z",
    "M289 205 C288 195 298 186 310 185 C325 183 336 192 338 202 C336 209 329 214 321 216 C310 219 296 217 289 214 Z",
  ],
  brows: [
    // Only the exposed wedge below the fringe: y178 at x168, y171 at x180,
    // y168 at x192, y166 across x208…228. The darker eyelid below it is skin.
    "M168 178 C175 167 187 162 202 161 C217 160 230 161 237 163 C224 167 207 165 192 168 C181 171 174 175 168 178 Z",
    "M278 154 C281 149 291 148 302 148 C321 147 337 157 346 174 C330 164 308 162 279 164 Z",
  ],
  lashes: [
    "M175 207 C177 194 189 184 203 184 C219 182 232 192 235 209 L231 209 C228 197 217 187 204 188 C191 188 181 197 179 208 Z",
    "M286 204 C287 191 298 183 312 183 C328 181 339 191 342 203 L337 205 C333 194 323 187 311 188 C299 188 291 195 290 206 Z",
  ],
  mouth: [
    "M212 279 C230 286 251 289 273 285 C290 283 302 279 309 275 C304 288 291 301 275 307 C255 313 234 307 221 294 C216 289 213 283 212 279 Z",
  ],
  protectedPoints: [
    { x: 211, y: 204 }, { x: 190, y: 205 }, { x: 307, y: 202 },
    { x: 326, y: 204 }, { x: 300, y: 156 }, { x: 182, y: 169 },
    { x: 257, y: 292 }, { x: 259, y: 304 },
  ],
  skinPoints: [
    { x: 212, y: 177 }, { x: 232, y: 177 }, { x: 300, y: 145 },
    { x: 200, y: 180 }, { x: 210, y: 223 }, { x: 309, y: 222 },
    { x: 286, y: 215 }, { x: 260, y: 279 },
  ],
} as const;

const FEMALE_FEATURES = {
  eyes: [
    "M179 218 C180 207 191 198 205 198 C221 197 231 209 235 225 L234 230 C221 235 200 238 185 229 C181 226 179 221 179 218 Z",
    "M292 216 C291 204 301 194 313 191 C328 188 340 195 345 204 C343 213 335 220 323 223 C311 227 298 227 293 223 Z",
  ],
  brows: [
    "M207 167 C215 161 226 162 232 167 C234 169 235 171 235 174 C225 172 216 174 208 174 Z",
    "M284 164 C291 159 304 156 317 156 C332 155 342 163 347 173 C331 164 309 165 284 170 Z",
  ],
  lashes: [
    "M174 220 C177 204 190 194 205 194 C223 192 235 208 238 225 L233 226 C229 210 219 199 206 199 C192 199 181 209 178 221 Z",
    "M290 212 C292 197 303 187 318 186 C332 183 343 192 349 201 L353 201 L350 205 L354 204 L350 208 L346 211 C340 199 329 192 316 193 C304 194 296 203 294 214 Z",
  ],
  mouth: [
    "M217 291 C234 297 254 298 273 295 C291 292 306 288 315 283 C308 299 292 314 274 320 C254 326 235 316 223 303 C219 298 218 294 217 291 Z",
  ],
  protectedPoints: [
    { x: 213, y: 216 }, { x: 190, y: 219 }, { x: 312, y: 210 },
    { x: 336, y: 208 }, { x: 306, y: 161 }, { x: 225, y: 169 },
    { x: 263, y: 304 }, { x: 263, y: 317 },
  ],
  skinPoints: [
    { x: 240, y: 176 }, { x: 304, y: 151 }, { x: 307, y: 175 },
    { x: 219, y: 191 }, { x: 213, y: 239 }, { x: 309, y: 231 },
    { x: 287, y: 219 }, { x: 260, y: 289 },
  ],
} as const;

/**
 * The same tight facial footprint was inspected against both original variants;
 * entries remain source-specific so replacing any asset requires renewed review.
 * The glasses variant's frame coverage is applied separately, after these holes.
 */
export const AVATAR_FEATURE_PATHS = {
  male: {
    source: "/avatar/scenes/v2/male.webp",
    sha256: "7f9899e7024c6090692585ba2fd26fd1430c2760b4d6b531d20ac5e1c7f36e59",
    ...MALE_FEATURES,
  },
  "male-glasses": {
    source: "/avatar/scenes/v2/male-glasses.webp",
    sha256: "ff9d0e8c53fc5f1168d9e9cc40ebb0f040dc2154225a06a5c99e1364a9ba3cc5",
    ...MALE_FEATURES,
  },
  female: {
    source: "/avatar/scenes/v2/female.webp",
    sha256: "e95c91cfd17ebc4965c8acfc74d8d4d19d787a5b91a99c46c425221f17b126a2",
    ...FEMALE_FEATURES,
  },
  "female-glasses": {
    source: "/avatar/scenes/v2/female-glasses.webp",
    sha256: "a14b3ce493f0d161cd6257d8f334531bc921bc341cf45a46481695ffee80bfb0",
    ...FEMALE_FEATURES,
  },
} as const satisfies Readonly<Record<"male" | "female" | "male-glasses" | "female-glasses", AvatarFeatureGeometry>>;
