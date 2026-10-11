# GramForGrow mobile app

Expo (React Native) app for Android, with iOS possible later from the same code. It talks to the same FastAPI backend as the web dashboard.

**How it works:**
- **Sign-in:** native screen (email + password).
- **After sign-in:** the app shows the web dashboard (gramforgrow.in/dashboard) in a WebView, so it looks exactly like the website on a phone: hamburger, left sidebar, every page. A change to the website shows up in the app straight away, without an app update.
- **Session:** the app hands its login to the website, and the website reports token refreshes and sign-out back. Signing out on the website brings the app back to its login screen.
- **Push notifications:** for new conversations, messages in chats you've taken over, and new orders. Tapping one opens that chat (`/dashboard/inbox?c=…`) or the Shop.
- **Links:** Instagram, payment and other outside links open in the phone's own apps or browser. The Android back button goes back through the dashboard's pages.

## Run it on your phone

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with **Expo Go**. By default the app uses the production API on Railway.

To use your local backend instead (`npm run dev` at the repo root):
- Create `mobile/.env.local` containing `EXPO_PUBLIC_API_URL=http://<your-PC-LAN-IP>:8001/api`.
- Make sure the phone is on the same Wi-Fi as your PC.

Push notifications don't work in Expo Go on Android, so test them with a preview APK (below).

## Builds (EAS, free plan)

```bash
npx eas-cli@latest login
npx eas-cli@latest init                 # links the project and writes extra.eas.projectId into app.json (push needs it)
npx eas-cli@latest credentials          # Android → add the FCM V1 service-account key (free Firebase project)
npx eas-cli@latest build -p android --profile preview      # installable APK to share with testers
npx eas-cli@latest build -p android --profile production   # .aab for the Play Store
npx eas-cli@latest submit -p android                       # uploads to the Play Console internal track
```

The Play Console needs a one-time $25 developer account.

New personal accounts have to run a **closed test with at least 12 testers for 14 days** before they can publish to production.

## Code layout

- `src/app/login.tsx`: the sign-in screen.
- `src/app/index.tsx`: the dashboard WebView and the session bridge script.
- `src/lib/api.ts`: sign-in and devices API, and the session in SecureStore. Refresh tokens rotate, so the session carries a `gen` number that decides whether the app's or the website's copy is newer.
- `src/lib/session.tsx`: the signed-in user, plus sign-in and sign-out.
- `src/lib/push.ts`: registers this phone's Expo push token at `POST /api/devices`. The backend sends pushes from `backend/app/services/push.py`.
