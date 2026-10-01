# Simulators, emulators, test login

## iOS simulator

```sh
xcrun simctl list devices available | grep -i iphone
xcrun simctl boot <udid> && open -a Simulator
npx react-native run-ios --simulator "<name>"      # or the app's script
xcrun simctl io booted screenshot /tmp/ios.png
```

## Android emulator

```sh
emulator -list-avds
emulator -avd <name> -no-snapshot-load &          # cold boot when it misbehaves
adb wait-for-device && adb devices
npx react-native run-android                      # or the app's script
adb exec-out screencap -p > /tmp/android.png
adb shell input text "$TEST_SSN"                  # type into the focused field
```

Different behaviour on one emulator → try a second AVD image (other API
level) before blaming the code.

## Environment and login

- Point the app at the asked environment through its env file / scheme
  (staging is usual). Do not edit `.env.production` for a local run.
- Dev and staging accept a test personnummer with no BankID round-trip; read
  it from `$TEST_SSN` (or the name the repo documents). Not exported → ask the
  user to `export TEST_SSN=…` in their shell. Never echo it, never write it to
  a file, never put it in a commit, test or log.
- BankID "open again" loops locally mean the app is taking the BankID path —
  check the dev-only SSN branch is active (`__DEV__` / env flag), not the
  BankID app.
