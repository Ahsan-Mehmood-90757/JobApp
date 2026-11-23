# JobApp mobile (Expo, iOS + Android)

Five screens: onboarding/profile, job feed, job detail + match check, resume editor with
"Tailor to this job", and PDF preview/export. See the root README for the API.

```bash
# from the repo root, with the API running (npm run api:dev)
cd apps/mobile
npx expo start          # press i for iOS Simulator, a for Android, or scan the QR with Expo Go
```

The app finds the API automatically on the machine running Expo (port 4000), which works for
the iOS Simulator and for a phone on the same Wi-Fi. Set `EXPO_PUBLIC_API_URL` in `.env` to
point somewhere else.

Checks: `npx tsc --noEmit` and `npx expo lint`.
