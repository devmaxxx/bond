# React Native demo

Proven in react-native-next-wheel-picker.

## Apps

- `example/` — the bob-generated bare app (native dev loop).
- `example-expo/` — the shareable demo: Expo app consuming the lib, with a web
  target. Its version stays fixed (EAS `runtimeVersion: { policy: appVersion }`),
  not bumped with the lib. The EAS project slug is the full lib name.

## Three ways to see it

1. **Web** — `npx expo export --platform web --output-dir dist` in
   `example-expo/`, deployed to Pages by a `demo.yml` workflow on pushes that
   touch `src/**` or `example-expo/**`.
2. **EAS update** — `eas update --branch main` publishes the JS bundle; a QR in
   the README opens it in Expo Go / a dev build.
3. **APK** — `eas build -p android --profile preview`, attached to a `demo`
   GitHub release (`gh release upload demo app.apk --clobber`), separate from the
   versioned releases.

## GIFs

`scripts/gifs/record-ios.sh` (simulator + `axe` taps/swipes),
`record-android.sh` (`adb shell screenrecord` + `input swipe`), and `to-gif.sh`
(ffmpeg palette). Coordinates are in points for one named device; the script
header names it, and the tool deps (`brew install ffmpeg cameroncooke/axe/axe`).
