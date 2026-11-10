/** The post pass: tone map, edge light, hue-shifted grade, night floor, palette snap. */
export const postVertex = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
export const postFragment = /* glsl */`
precision highp float;
uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 uRes; uniform float uCave; uniform float uTime; uniform float uHurt;
uniform float uExposure; uniform float uSaturation; uniform float uContrast; uniform float uWarm; uniform float uCool; uniform float uVignette;
uniform float uLevels; uniform float uDither; uniform float uOutline; uniform float uRim;
uniform highp sampler3D uLut; uniform float uPalette; uniform float uNightEdges; uniform vec3 uShadowTint; uniform vec3 uLightTint;
varying vec2 vUv;
float bayer(vec2 p){ int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0)); int i = x + y * 4;
  float m[16]; m[0]=0.;m[1]=8.;m[2]=2.;m[3]=10.;m[4]=12.;m[5]=4.;m[6]=14.;m[7]=6.;m[8]=3.;m[9]=11.;m[10]=1.;m[11]=9.;m[12]=15.;m[13]=7.;m[14]=13.;m[15]=5.;
  for (int k = 0; k < 16; k++) if (k == i) return m[k] / 16.0; return 0.0; }
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
void main(){
  vec2 px = 1.0 / uRes;
  vec3 c = texture2D(tColor, vUv).rgb;
  float d = texture2D(tDepth, vUv).r;
  float dl = texture2D(tDepth, vUv - vec2(px.x, 0.0)).r, dr = texture2D(tDepth, vUv + vec2(px.x, 0.0)).r;
  float du = texture2D(tDepth, vUv + vec2(0.0, px.y)).r, dd = texture2D(tDepth, vUv - vec2(0.0, px.y)).r;
  c = aces(c * uExposure);
  float l = luma(c);
  // Edge light: silhouettes whose upper/left neighbour is farther catch the low sun.
  float edgeTop = step(0.002, du - d), edgeLeft = step(0.002, dl - d);
  float lit = smoothstep(0.18, 0.55, l);
  c += max(edgeTop, edgeLeft) * lit * vec3(1.0, 0.5, 0.16) * uRim * (1.0 - uCave);
  // Dark outline where something nearer sits below/right (shadow side).
  float edgeDark = step(0.002, d - min(dd, dr));
  // Strong outline styles ink every silhouette edge, not only the shadow side.
  float edgeAny = step(0.002, max(max(dl, dr), max(du, dd)) - d) * step(0.6, uOutline);
  c *= 1.0 - max(edgeDark, edgeAny * 0.8) * uOutline;
  // Split tone: teal shadows, orange highlights.
  l = luma(c);
  // Underground the dark is earth, not sky: shadows lean warm-neutral, after the flashlight reference's cellar.
  vec3 cool = mix(vec3(0.74, 0.82, 1.12), vec3(1.0, 0.94, 0.84), uCave);
  c = mix(c, mix(c * cool, c, smoothstep(0.08, 0.5, l)), max(uCool, uCave));
  // Hue-shifted grade: shadows lean to the keyframe's shadow tint, lights to its light tint.
  c *= mix(uShadowTint, uLightTint, smoothstep(0.03, 0.5, luma(c)));
  // Night floor: unlit terrain rests on a faint indigo (palette night[1]) and silhouette edges sit half a step above it,
  // enough to find a wall in the dark without drawing the world as a wireframe. A floor under the picture, not light.
  float sil = step(0.002, max(max(dl, dr), max(du, dd)) - d) * step(d, 0.9999);
  // Edges only at Close and Play; in Scenery they would draw distant forests as wireframe.
  c = max(c, mix(mix(vec3(0.0037, 0.0048, 0.013), vec3(0.0046, 0.0040, 0.0034), uCave), mix(vec3(0.0052, 0.0068, 0.0190), vec3(0.0075, 0.0066, 0.0056), uCave), sil * uNightEdges));
  c = mix(c, c * vec3(1.14, 0.97, 0.74), smoothstep(0.32, 0.9, l) * (1.0 - uCave) * uWarm);
  c = mix(vec3(luma(c)), c, uSaturation);
  vec2 q = vUv - 0.5;
  c += vec3(1.0, 0.5, 0.18) * 0.06 * uWarm * (1.0 - uCave) * smoothstep(1.0, 0.0, length(vUv - vec2(0.0, 1.0)));
  c *= 1.0 - dot(q, q) * (uCave > 0.5 ? max(1.1, uVignette) : uVignette);
  c = mix(c, c * vec3(1.25, 0.45, 0.4), uHurt * smoothstep(0.15, 0.6, length(q)));
  c = pow(max(c, 0.0), vec3(1.0 / 2.2));
  // Contrast pivots on display mid-grey, after gamma, so dark ground keeps its detail.
  c = clamp((c - 0.5) * uContrast + 0.5, 0.0, 1.0);
  if (uPalette > 0.5) {
    // Ordered dither nudges colours near a palette boundary, so bands break up only at their edges.
    vec3 d = c + (bayer(gl_FragCoord.xy) - 0.5) * uDither / 24.0;
    c = texture(uLut, clamp(d, 0.0, 1.0) * (31.0 / 32.0) + 0.5 / 32.0).rgb;
  } else c = floor(c * uLevels + 0.5 + (bayer(gl_FragCoord.xy) - 0.5) * uDither) / uLevels;
  gl_FragColor = vec4(c, 1.0);
}`;
