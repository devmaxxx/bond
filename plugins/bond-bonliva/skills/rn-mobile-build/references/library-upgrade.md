# Native library upgrade checklist

1. Read the changelog from the current version to the target; note native
   setup changes and New Architecture support. React Native itself → use the
   upgrade helper diff for the two versions.
2. Install the exact version (no `^` drift for native libs); keep the lockfile.
3. `patches/<lib>+<old>.patch` — a patch is keyed to a version and fails
   `postinstall` after the bump. Check whether upstream fixed the issue (then
   delete the patch), otherwise regenerate it against the new version. Keep
   a patch to the smallest hunk that is still needed.
4. iOS: `cd ios && bundle exec pod install` (add `--repo-update` when a spec is
   not found); commit `Podfile.lock`.
5. Native config: AndroidManifest permissions, `build.gradle`, AppDelegate,
   Info.plist, entitlements — diff against the library's install docs.
6. Notifications (react-native-notifications, notifee, push-notification-ios,
   Firebase messaging): test on a **real device** in foreground, background
   and killed states, plus tap-to-open deep links; Android 13+ needs the
   runtime permission; iOS needs the push entitlement and APNs key.
7. Build release configurations of both platforms (`assembleRelease`, an iOS
   archive or the beta lane) — debug builds hide R8 and bundling failures.
8. Swapping one library for another: remove the old package's native leftovers
   (pods, gradle entries, imports) so `No podspec found` cannot appear later.
