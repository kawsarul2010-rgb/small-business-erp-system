/**
 * Android (Capacitor) build: the app runs from the device, so it needs the full address of your API.
 *
 * Set this to your deployed URL, e.g. https://tasifmatrix-erp.up.railway.app
 * build-apk.sh refuses to build while it still says CHANGE-ME.
 * For testing against your Mac on the same Wi-Fi use your computer's IP, e.g. http://192.168.0.105:5080
 * (plain http also needs android:usesCleartextTraffic - see README).
 */
export const environment = {
  production: true,
  apiBaseUrl: 'https://sompriti-sikriti-business.up.railway.app',
};
