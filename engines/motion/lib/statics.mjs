// The ONLY place motion imports code from engines/stills (Studio Stills). Stills and motion share
// colour maths (derived accent/contrast), Canadian mortgage maths, the compliance field
// list and the vendored-font @font-face list, so a client's reels and statics agree to
// the cent and the colour. If stills refactors, fix the paths here and nowhere else.
export { deepMerge } from '../../stills/lib/tokens.mjs';
export { contrast, ensureContrast, mix, bestOn } from '../../stills/lib/color.mjs';
export { payment as amortPayment } from '../../stills/lib/mortgage.mjs';
export { missingFields } from '../../stills/lib/compliance.mjs';
export { fontFaceCSS } from '../../stills/lib/page.mjs';
