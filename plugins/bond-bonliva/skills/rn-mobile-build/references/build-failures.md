# Known build failures

Match the error text first; each row is a fix that worked here.

| Error | Cause | Fix |
| --- | --- | --- |
| `unable to attach DB … XCBuildData/build.db: database is locked` | two builds share DerivedData (Xcode open + CLI/fastlane, or two lanes) | quit Xcode, `pkill -f xcodebuild; pkill -f XCBBuildService`, delete this app's DerivedData folder, rerun once |
| `The Xcode build system has crashed. Build again to continue.` | stale XCBBuildService | same as above |
| `[!] No podspec found for X in ../node_modules/Y` | the JS package was removed/renamed but the native side still references it, or `node_modules` is stale | reinstall JS deps from the lockfile, then `cd ios && bundle exec pod install`; if the package was replaced, remove its leftover native config |
| `Support for your Ruby version (3.0.x) is going away … requires Ruby 3.3` | old Ruby | install Ruby ≥ 3.3 (rbenv/asdf, `.ruby-version`), then `bundle update fastlane` in **both** `ios/` and `android/`; commit the Gemfile/Gemfile.lock changes |
| `yarn ios` / `yarn: command not found` | repo uses npm/nx, not yarn | use the app's `package.json` scripts or `npx react-native run-ios` |
| Signing / provisioning profile / API key errors in `ios:beta` | expired cert or missing App Store Connect key env | check the lane's `app_store_connect_api_key` env vars are exported; never paste the key into a file you commit |
| Build number rejected (already used) | lane reuses a build id | let the lane's `increment_build_number` source decide; do not hand-edit project.pbxproj |
| Android release build crashes but debug works | ProGuard/R8 stripping, or a native lib missing for release | `./gradlew assembleRelease` locally, read the logcat stack, add keep rules |
| Push received on emulator, not on device (Android) | Android 13+ runtime `POST_NOTIFICATIONS` permission, or missing channel | request the permission at runtime; create the channel before the first notification |

## Diagnosing a fastlane lane

1. Run the same script the user ran (`npm run ios:beta`), capture output to a
   file, read only the tail and `fastlane/report.xml`.
2. Identify the failing action, not the last line: fastlane prints the
   failing action name above the stack.
3. `pbxproj` edits: change only the setting at fault; Xcode rewrites unrelated
   sections and that diff must not be committed.
4. Lanes that build in a worktree (`build_in_worktree`, `*:in-place`) exist so
   local edits never ship — reproduce with the same lane, not by hand.
5. Rerun after the fix and report the lane's final line.
