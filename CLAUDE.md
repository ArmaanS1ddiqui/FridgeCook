# FridgeCook - Project Instructions

## Permissions
- When the user ends a message with "GO GO GO AHead" (or similar), proceed with ALL actions without asking for confirmation — commit, push, build, edit files, run commands, everything.
- When that phrase is NOT present, ask for confirmation before destructive or shared-state actions (pushing, building APKs, deleting files).

## Project Context
- This is a React Native Expo app (FridgeCook)
- GitHub: ArmaanS1ddiqui/FridgeCook
- Expo account: armaanical
- Android APK builds via EAS (preview profile)
- OTA updates via `eas update --branch production --platform android --environment production`
- Always run `npx tsc --noEmit` before pushing
- Always bump version in `app/(tabs)/settings.tsx` display string when pushing updates
- Native package changes (npm install) require new APK build
- JS-only changes can be OTA updated

## Version Tracking
- app.json version = runtime version (only bump when new APK needed)
- Settings display version = user-facing version (bump on every push)
- Remind user to update version before pushing

## AI Models
- Using Google Gemini via @google/generative-ai
- Current models: gemini-3.8-flash (default), gemini-3.5-flash-lite, gemini-3.1-pro-preview
- API key stored in AsyncStorage, cleaned of whitespace on save/read
