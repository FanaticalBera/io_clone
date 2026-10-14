// Measurement and experiment features (performance PRD v0.4.2) run only in dev/test builds or the
// measurement APK (`vite build --mode apk-perf`), which keeps the shipped APK setup (bundled fonts).
export const PERF_BUILD=import.meta.env.DEV||import.meta.env.MODE==='test'||import.meta.env.MODE==='apk-perf';
export const APK_BUILD=import.meta.env.MODE==='apk'||import.meta.env.MODE==='apk-perf';
