// Extends app.json with values that come from environment variables.
// Expo loads app.json first and passes it in as `config`; whatever this
// returns is the final app config.
//
// GOOGLE_MAPS_ANDROID_API_KEY is stored in EAS (eas env:create) and is read
// at build time. react-native-maps uses Google Maps on Android, and release
// builds show a blank map without this key. iOS uses Apple Maps and needs
// no key. For a local Android build, set the variable in your shell or .env.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    config: {
      ...config.android?.config,
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY,
      },
    },
  },
});
