import type {CapacitorConfig} from '@capacitor/cli';

// The APK bundles build/apk-web (npm run build:apk); never set server.url here (the app must run with no dev PC or internet).
const config:CapacitorConfig={
 appId:'com.hexhold.game',
 appName:'HEXHOLD',
 webDir:'build/apk-web',
 android:{allowMixedContent:false}
};
export default config;
