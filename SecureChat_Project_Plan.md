# 🔐 SecureChat — Complete Project Plan

---

## 1. Project Overview

SecureChat is a mobile-first encrypted messaging app for private group communication, featuring password-protected rooms, end-to-end encryption, ephemeral messaging, offline message queuing, and a separate web-based admin dashboard with full room and user management.

---

## 2. Full Tech Stack

### Mobile App
| Tool | Purpose |
|---|---|
| **React Native** | Cross-platform mobile framework (iOS + Android) |
| **Expo** | Simplified React Native toolchain, OTA updates, build service |
| **Expo Crypto / WebCrypto** | RSA keypair generation, AES-GCM encryption |
| **Expo SQLite** | Local offline message queue storage |
| **Expo SecureStore** | Secure local storage for private keys |
| **React Navigation** | Screen navigation |
| **Socket.io Client** | Real-time WebSocket communication |
| **Zustand** | Lightweight state management |
| **React Native Reanimated** | Smooth bioluminescent animations |
| **NativeWind** | Tailwind CSS for React Native styling |

### Admin Dashboard (Web)
| Tool | Purpose |
|---|---|
| **React + Vite** | Fast web frontend |
| **TailwindCSS** | Styling |
| **Recharts** | Server health graphs & stats |
| **Axios** | HTTP requests to admin API |
| **otpauth (JS library)** | TOTP 2FA code verification on the frontend |

### Backend Server
| Tool | Purpose |
|---|---|
| **Node.js + Express** | HTTP server & REST API |
| **Socket.io** | WebSocket server for real-time chat |
| **SQLite + better-sqlite3** | User registry, ban list |
| **speakeasy** | TOTP 2FA secret generation & verification |
| **qrcode** | Generate QR code for admin 2FA setup |
| **bcrypt** | Password hashing |
| **jsonwebtoken (JWT)** | Admin session tokens |
| **node-os-utils** | CPU, RAM, uptime stats for dashboard |

### Services & Infrastructure
| Service | Purpose | Cost |
|---|---|---|
| **Expo EAS Build** | Build iOS & Android app binaries | Free tier available |
| **Railway / Render / Fly.io** | Host the Node.js server | Free tier available |
| **Vercel / Netlify** | Host the admin web dashboard | Free |
| **Apple Developer Program** | Publish to App Store | $99/year |
| **Google Play Console** | Publish to Play Store | $25 one-time |
| **GitHub** | Version control | Free |

---

## 3. AI Tools — Who Excels at What

| Part of the App | Best AI Tool | Why | Est. % Claude Can Do |
|---|---|---|---|
| **Backend (Node.js, Socket.io, auth, DB)** | Claude | Strong at server architecture, security logic, crypto | **90%** |
| **React Native screens & navigation** | Claude | Solid component generation, navigation wiring | **85%** |
| **E2E Encryption logic** | Claude | Precise crypto implementation (RSA, AES-GCM) | **90%** |
| **Admin Dashboard (React web)** | Claude | Clean dashboards, tables, forms | **90%** |
| **Bioluminescent UI / animations** | Claude + **Cursor/Copilot** | Complex animations benefit from iterative visual tweaking | **70%** |
| **App Store submission setup** | Human required | Apple/Google review process requires manual steps | **10%** |
| **2FA QR onboarding flow** | Claude | Well-defined TOTP flow | **85%** |
| **Offline queue sync edge cases** | Claude | Logic-heavy, well-suited | **80%** |
| **Overall project** | **Claude** | — | **~82%** |

> The remaining ~18% is visual polish (animations), device-specific testing, and app store submission — all human tasks.

---

## 4. Assets — Where to Get Them

### Icons & UI Icons
- **[Lucide Icons](https://lucide.dev)** — clean, open source, React Native compatible
- **[Phosphor Icons](https://phosphoricons.com)** — great variety, free
- **[Expo Vector Icons](https://icons.expo.fyi)** — built into Expo, no install needed

### Fonts
- **[Google Fonts](https://fonts.google.com)** — free
  - Suggested: *Space Grotesk* (techy, modern) + *JetBrains Mono* (monospace accents)
- Load via `expo-font` or `@expo-google-fonts`

### Sounds (optional notification sounds)
- **[Mixkit](https://mixkit.co/free-sound-effects/)** — free, no attribution required
- **[Freesound](https://freesound.org)** — large library, check licenses per file

### Background / Texture Assets
- **[SVGBackgrounds.com](https://www.svgbackgrounds.com)** — free SVG patterns
- **[Haikei](https://haikei.app)** — generate custom bioluminescent-style wave/blob SVGs free

### App Icon & Splash Screen
- Design in **[Figma](https://figma.com)** (free) — export as PNG
- Use **[Expo's icon generator](https://docs.expo.dev/develop/user-interface/splash-screen/)** to auto-resize for all platforms

### Stock Illustrations (if needed)
- **[unDraw](https://undraw.co)** — free, customizable color SVG illustrations

---

## 5. Build Steps & Estimated Timeline

> Assumes 1 developer working part-time (~3–4 hrs/day), using AI assistance heavily.

---

### Phase 1 — Project Setup *(~2 days)*
- Initialize React Native (Expo) project
- Initialize React (Vite) admin project
- Initialize Node.js server project
- Set up GitHub repo with `/mobile`, `/admin`, `/server` folders
- Configure ESLint, Prettier, folder structure
- Set up environment variable files (`.env`)

---

### Phase 2 — Backend Core *(~4 days)*
- Express server with REST routes
- Socket.io setup for real-time events
- In-memory room management (create, join, close, user list)
- SQLite setup: users table, bans table
- Password hashing with bcrypt
- Room join logic (code + password hash check)
- Ownership model: owner, co-owner, transfer enforcement
- Offline message queue: accept queued messages on reconnect

---

### Phase 3 — Encryption Layer *(~3 days)*
- RSA-2048 keypair generation on first app launch (stored in SecureStore)
- Public key exchange on room join
- AES-GCM message encryption before send
- AES-GCM decryption on receive
- Key derivation for room password (SHA-256 hash, never sent plaintext)

---

### Phase 4 — Mobile App Screens *(~6 days)*
- Welcome screen
- Create Room screen
- Join Room screen (sends join request or enters directly with correct password)
- Waiting Room screen ("Awaiting approval…")
- Chat screen: messages, member list, owner badge, leave gate
- Promote Member screen (owner must select co-owner before leaving)
- Offline queue indicator on messages ("Queued", "Sent", "Delivered")

---

### Phase 5 — Bioluminescent UI & Animations *(~4 days)*
- Color palette: deep navy `#050d1a`, teal glow `#00f5d4`, violet `#7b2ff7`
- Message bubbles with soft glow shadows
- Animated background (slow-moving light particles using Reanimated)
- Smooth screen transitions
- Join request pop-up with pulse animation
- App icon and splash screen design

---

### Phase 6 — Admin Panel *(~5 days)*
- Separate React web app on its own route/domain
- Admin login screen (password + TOTP)
- TOTP setup flow (QR code scan with Google Authenticator)
- Dashboard: live CPU, RAM, uptime, room count, connected users (Recharts graphs)
- Rooms screen: list of active rooms, users per room, force-close button
- Broadcast screen: send message to specific room or all rooms
- Admin join request: sends request to room owners/co-owners, waits for approval
- Users screen: full user table, search, ban/unban

---

### Phase 7 — Integration & Testing *(~4 days)*
- Connect mobile app to server end-to-end
- Test encryption round-trip (encrypt on device A, decrypt on device B)
- Test offline queue: queue messages, reconnect, verify delivery order
- Test ownership transfer edge cases (owner tries to leave, only one member left, etc.)
- Test admin 2FA flow
- Test ban enforcement
- Basic load test (multiple concurrent rooms)

---

### Phase 8 — Polish & Deployment *(~3 days)*
- Fix bugs from testing
- Final UI polish
- Deploy server to Railway/Render
- Deploy admin dashboard to Vercel
- Build mobile app with Expo EAS
- Write README with setup instructions, 2FA config guide, security architecture notes

---

### Total Estimated Time

| Phase | Time |
|---|---|
| Setup | 2 days |
| Backend Core | 4 days |
| Encryption | 3 days |
| Mobile Screens | 6 days |
| UI & Animations | 4 days |
| Admin Panel | 5 days |
| Testing | 4 days |
| Polish & Deploy | 3 days |
| **Total** | **~31 days** |

> With heavy AI assistance, this can realistically be completed in **4–5 weeks** part-time, or **2–3 weeks** full-time.

---

## 6. Security Architecture Summary

```
Device A                    Server (RAM only)               Device B
────────────────────────────────────────────────────────────────────
Generate RSA keypair        Receives public keys            Generate RSA keypair
                            Stores in memory (no DB)
Encrypt msg with B's        Never sees plaintext            Decrypt with own
public key + AES-GCM        Routes encrypted blob           private key

Password hash (SHA-256)     Compares hash only              Password hash (SHA-256)
never sent plaintext        Never stores plaintext          never sent plaintext

Room closed → all           Wipes room from RAM             Messages gone
messages deleted locally    instantly                       locally
```

---

*Document prepared for approval before development begins.*
