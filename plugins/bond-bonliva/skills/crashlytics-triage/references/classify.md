# Real vs noise

Decide per issue, not per event. Say why in one line.

## Real — file it

- The top non-library frame is in our source (`src/`, `apps/*/src`, our native
  modules) and the cause is readable there: an unchecked null, a navigation
  param that is not serializable, state updated after unmount, a missing
  permission check, an unhandled promise rejection from our code.
- Spread across several users and devices, or rising in the latest version.

## Upstream — file it, fix is a version bump or a patch

- The crash is inside a library (react-native-screens, picker, webview,
  notifications, vision-camera…) and our call into it is valid. Check the
  library's changelog and issues for a fix in a newer version before writing
  a patch; a `patches/*.patch` is the last resort and needs a reason.

## Noise — list it, do not file

- Debug/dev builds (dev bundle ids, `__DEV__` paths, Metro URLs in frames),
  simulators and emulators.
- One user, one device, once — unless it is a data-loss path.
- OS kills: watchdog `0x8badf00d`, out-of-memory terminations, background
  task expirations with no frame of ours.
- Jailbroken/rooted or unofficial-store builds; ancient OS versions the app
  no longer supports.
- Versions no longer shipped, when the current release no longer has the
  frame.

## Jira bug body

```
Crashlytics: <issue URL>
Platform / versions: <android|ios> <versions>
Impact: <events> events, <users> users, last <N> days
Frame: <file>:<line> (<function>)
Cause: <one or two sentences>
Fix idea: <what to change, or "upstream: <lib> <version> fixes it">
```
