# Cache cleanup

Measure, show, then delete what the user picks. `du -sh <path> 2>/dev/null`
each row; skip rows that do not exist.

| Cache | Path | Safe? | Rebuilt by |
| --- | --- | --- | --- |
| Xcode DerivedData (this app) | `~/Library/Developer/Xcode/DerivedData/<App>-*` | yes | next build |
| Xcode DerivedData (all) | `~/Library/Developer/Xcode/DerivedData` | yes, slow next build of every project | builds |
| Xcode caches | `~/Library/Caches/com.apple.dt.Xcode` | yes | Xcode |
| iOS device support | `~/Library/Developer/Xcode/iOS DeviceSupport/*` | old OS versions only | plugging a device in |
| Simulators | `xcrun simctl delete unavailable` | yes | — |
| Pods | `<app>/ios/Pods`, `~/Library/Caches/CocoaPods` | yes | `bundle exec pod install` |
| iOS build | `<app>/ios/build` | yes | build |
| Metro / haste | `$TMPDIR/metro-*`, `$TMPDIR/haste-map-*`, `watchman watch-del-all` | yes | `start --reset-cache` |
| Android build | `<app>/android/{build,app/build,.gradle,.cxx,app/.cxx}` | yes | build |
| Gradle global | `~/.gradle/caches` | yes, long re-download | gradle |
| AVD snapshots | `~/.android/avd/<name>.avd/snapshots` | yes — keeps the AVD | cold boot |
| Monorepo caches | `.nx/cache`, `.turbo`, `node_modules/.cache` | yes | next task run |
| node_modules | `node_modules` | yes, then reinstall from the lockfile | `npm ci` / `pnpm i --frozen-lockfile` |

**Never:** lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `Podfile.lock`,
`Gemfile.lock`) — deleting them silently upgrades dependencies;
`~/Library/Developer/Xcode/Archives` — the dSYMs of shipped builds;
`~/.android/avd/<name>.avd` itself when only the snapshots are large.

Order when a build is wedged: stop builds (quit Xcode, `pkill -f
XCBBuildService`, `./gradlew --stop`) → app DerivedData + Metro → Pods
(`cd ios && bundle exec pod install`) → only then the global caches.
For whole-disk questions, use `/bond:disk-analyze`.
