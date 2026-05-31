import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId:   'com.assignmate.app',
  appName: 'AssignMate',
  webDir:  'dist',

  server: {
    // Use https scheme inside the Android WebView (required for some Web APIs)
    androidScheme: 'https',
  },

  android: {
    // Allows the WebView to load resources from mixed http/https origins during dev
    allowMixedContent: true,
    // Target a modern WebView — improves CSS/JS compatibility
    minWebViewVersion: 80,
  },

  plugins: {
    // Splash screen: white background, auto-hide after web content is ready
    SplashScreen: {
      launchShowDuration:   0,
      backgroundColor:      '#ffffff',
      showSpinner:          false,
      androidSpinnerStyle:  'small',
    },
  },
};

export default config;
