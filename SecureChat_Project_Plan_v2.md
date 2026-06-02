# 🔐 SecureChat — Updated Project Plan v2

---

## 1. Project Overview

SecureChat is a mobile-first encrypted messaging app for private group communication. It features password-protected rooms, end-to-end encryption (RSA-2048 + AES-GCM), ephemeral messaging (server stores nothing to disk), offline message queuing, a persistent username identity system, push notifications, and a separate web-based admin dashboard with full room and user management, TOTP 2FA, and live server health monitoring.

The app supports three UI themes: **Bioluminescent** (dark mode), **Soft Glass** (light mode), and **Terminal** (hacker/power-user mode).

---

## 2. Identity & Username System

This was missing from v1 and needs to be designed before anything is built.

### How Identity Works

- On first app launch, the app generates a **UUID-based user ID** stored locally in `Expo SecureStore`.
- The user is prompted to **choose a username** (alphanumeric, 3–20 chars, no spaces). This is checked for uniqueness against the server.
- The username is registered server-side in SQLite alongside their UUID.
- Usernames persist across rooms — `@jake` is always `@jake` on this server instance.
- There is **no account login** — identity is tied to the device. If the user reinstalls, they get a new identity. (This is intentional for privacy.)
- The admin panel displays usernames (e.g., `@jake`, `@maria`).

### Username Rules

- Unique per server instance.
- Cannot be changed after registration (simplicity; avoids impersonation).
- Admin can forcibly rename a username in edge cases (ban evasion, slurs, etc.) via the admin panel.

---

## 3. Full Tech Stack

### Mobile App

| Tool | Purpose | Cost |
|---|---|---|
| **React Native** | Cross-platform mobile framework (iOS + Android) | Free |
| **Expo (SDK 51+)** | Simplified RN toolchain, OTA updates, EAS build | Free tier available |
| **Expo Crypto / WebCrypto** | RSA keypair generation, AES-GCM encryption | Free (built-in) |
| **Expo SQLite** | Local offline message queue storage | Free (built-in) |
| **Expo SecureStore** | Secure local storage for private keys + user UUID | Free (built-in) |
| **Expo Notifications** | Push notification token management | Free (built-in) |
| **React Navigation v6** | Screen navigation (Stack + Bottom Tab) | Free |
| **Socket.io Client** | Real-time WebSocket communication | Free |
| **Zustand** | Lightweight global state management | Free |
| **React Native Reanimated 3** | Smooth bioluminescent animations | Free |
| **NativeWind v4** | Tailwind CSS for React Native (base styling) | Free |
| **React Native MMKV** | Fast key-value storage (theme preference, settings) | Free |

> ⚠️ **WebCrypto Note:** Test RSA keypair generation on both iOS and Android in Phase 1 — not Phase 3. Expo's WebCrypto implementation has had platform-specific quirks. If it proves unreliable, the fallback is `react-native-quick-crypto` (free, uses native OpenSSL bindings and is significantly faster).

### Admin Dashboard (Web)

| Tool | Purpose | Cost |
|---|---|---|
| **React + Vite** | Fast web frontend | Free |
| **TailwindCSS** | Styling | Free |
| **Recharts** | Server health graphs & stats | Free |
| **Axios** | HTTP requests to admin API | Free |
| **otpauth (JS library)** | TOTP 2FA code verification on the frontend | Free |
| **Socket.io Client** | Live stats feed from server | Free |

### Backend Server

| Tool | Purpose | Cost |
|---|---|---|
| **Node.js + Express** | HTTP server & REST API | Free |
| **Socket.io** | WebSocket server for real-time chat | Free |
| **SQLite + better-sqlite3** | User registry, ban list, push token store | Free |
| **speakeasy** | TOTP 2FA secret generation & verification | Free |
| **qrcode** | Generate QR code for admin 2FA setup | Free |
| **bcrypt** | Password hashing (room passwords, admin password) | Free |
| **jsonwebtoken (JWT)** | Admin session tokens (short expiry + refresh) | Free |
| **node-os-utils** | CPU, RAM, uptime stats for dashboard | Free |
| **express-rate-limit** | Rate limiting on all endpoints | Free |
| **helmet** | Secure HTTP headers (XSS, CORS, CSP) | Free |
| **expo-server-sdk** | Send push notifications via Expo Push Service | Free |

### Services & Infrastructure

| Service | Purpose | Cost |
|---|---|---|
| **Expo EAS Build** | Build iOS & Android app binaries | Free tier (30 builds/month) |
| **Railway** | Host Node.js server — recommended over Render for always-on | Free tier (limited); ~$5/month for hobby |
| **Render** | Alternative to Railway | Free tier (spins down after inactivity — bad for WebSockets) |
| **Fly.io** | Alternative — best for low-latency WebSocket apps | Free tier available; pay-as-you-go |
| **Vercel** | Host admin web dashboard | Free |
| **Apple Developer Program** | Publish to App Store | $99/year ✅ (you're paying this) |
| **Google Play Console** | Publish to Play Store | $25 one-time ✅ (you're paying this) |
| **GitHub** | Version control | Free |

> 💡 **Infrastructure Recommendation:** Use **Railway** for the server. Render's free tier sleeps after 15 minutes of inactivity which will kill active WebSocket connections. Railway's free tier stays alive and their $5/month hobby plan is worth it if you outgrow the free tier. Fly.io is the best option if you eventually need global edge deployment.

> 💰 **Paid option worth knowing:** **Supabase** ($0–$25/month) would replace SQLite + Railway storage with a hosted Postgres database — better for scale, built-in auth, real-time subscriptions. Overkill for v1 but a clean upgrade path.

---

## 4. Security Architecture

```
Device A                    Server (RAM only)               Device B
────────────────────────────────────────────────────────────────────
Generate RSA-2048 keypair   Receives public keys            Generate RSA-2048 keypair
Store private key in        Stores in memory (no DB)        Store private key in
SecureStore                                                 SecureStore

For each recipient:         Never sees plaintext            Decrypt AES key with
  Encrypt AES-256 key         Routes encrypted blobs          own RSA private key
  with their RSA public key                                 Decrypt message with
Encrypt message with                                        decrypted AES key
AES-256-GCM

Room password (PBKDF2)      Compares derived key only       Room password (PBKDF2)
never sent plaintext        Never stores plaintext          never sent plaintext

Room closed → all           Wipes room from RAM             Messages gone
messages deleted locally    instantly                       locally
```

### Group Encryption Model (Fixed from v1)

v1 left this undefined. Here is the correct design:

When a user sends a message in a room with N members, the client:
1. Generates a random **AES-256-GCM key** for this message.
2. Encrypts the plaintext message with this AES key.
3. Encrypts the AES key **separately for each recipient** using their RSA-2048 public key.
4. Sends the server one payload: `{ encryptedMessage, encryptedKeys: { userId1: encKey1, userId2: encKey2, ... } }`.
5. The server routes this blob to all room members.
6. Each recipient decrypts their copy of the AES key using their private RSA key, then decrypts the message.

This is the standard **hybrid encryption** model used by Signal, PGP, and others.

### Password Key Derivation (Fixed from v1)

v1 used SHA-256 for room password derivation. SHA-256 is fast, making it brute-forceable. The correct approach:

- Use **PBKDF2-SHA256** with 100,000 iterations to derive a key from the room password.
- On the client, derive the key from the user's input and send only the derived key for comparison.
- The server stores only the PBKDF2-derived key (never the raw password).
- bcrypt is still used for the admin panel password (it's better suited for login-style auth).

### Additional Security Measures

- **HTTPS enforced** on all server endpoints (handled by Railway/Fly.io TLS).
- **CORS** configured to only allow the admin dashboard domain and the mobile app.
- **Helmet.js** for secure HTTP headers.
- **Rate limiting** on all endpoints (see Phase 2).
- **JWT short expiry** — admin tokens expire in 15 minutes. A separate refresh token (24h expiry, stored httpOnly cookie) handles re-auth silently.
- **Input sanitization** on all user-provided fields (username, room name) to prevent injection.

---

## 5. Theme System Architecture

The app supports three UI themes, selectable by the user and persisted via MMKV.

### Bioluminescent (Dark Mode — Default)
- Background: `#050d1a`
- Primary accent: `#00f5d4` (teal glow)
- Secondary accent: `#7b2ff7` (violet)
- Animated radial gradient background (slow-moving, Reanimated)
- Message bubbles with soft `box-shadow` glow
- Font: Space Grotesk + JetBrains Mono for timestamps/status

### Soft Glass (Light Mode)
- Background: `#f0f4f8`
- Glass panels: `rgba(255,255,255,0.6)` with simulated blur (semi-transparent overlay; true `backdrop-filter` not reliably available on Android)
- Accent: `#5b8dee` (soft blue)
- Font: DM Sans
- No animations — clean, minimal

### Terminal (Power User / Hacker Mode)
- Background: `#000000`
- Text: `#00c832` (phosphor green)
- Monospace everything: IBM Plex Mono
- CRT scanline overlay via repeating CSS gradient
- Blinking cursor on input prompt
- High contrast — doubles as accessibility mode
- No decorative gradients or shadows

### Theme Implementation

```
/src/theme/
  index.ts          — exports useTheme() hook
  bioluminescent.ts — color tokens + animation configs
  softglass.ts      — color tokens
  terminal.ts       — color tokens
  ThemeProvider.tsx — wraps app, reads from MMKV
```

Theme is stored in MMKV (faster than AsyncStorage) and applied globally via React Context. All components consume `useTheme()` — no hardcoded colors anywhere.

---

## 6. Push Notifications Architecture

Missing entirely from v1.

### How It Works

1. On first app launch, request notification permission via `expo-notifications`.
2. Get the Expo Push Token for the device.
3. Send the token to the server along with the user's UUID — stored in SQLite (`push_tokens` table).
4. When a new message arrives for an offline/backgrounded user, the server calls the **Expo Push API** (free, no account needed beyond Expo) with their push token.
5. The notification shows: `"New message in [room name]"` — never the message content (for privacy).
6. Tapping the notification deep-links to the correct room.

### Push Token Table (SQLite)

```sql
CREATE TABLE push_tokens (
  user_id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### Privacy Consideration

Notifications are metadata-only: they reveal that *someone* sent *something* in *a named room*, but never the message content. Users can disable notifications per-room in settings.

---

## 7. Build Phases & Detailed Timeline

> Assumes 1 developer, part-time (~3–4 hrs/day), heavy AI assistance.

---

### Phase 0 — Design & Architecture Decisions *(~1 day)*

Do this before touching code. Decisions to lock in:

- Confirm WebCrypto works on target Expo SDK version (build a test app, generate an RSA keypair, encrypt + decrypt a string on both iOS simulator and Android emulator).
- Design the group encryption payload schema (JSON structure for `encryptedMessage` + `encryptedKeys`).
- Decide Railway vs Fly.io for hosting.
- Sketch all screens as rough wireframes (you already have these).
- Define all Socket.io event names (`room:join`, `room:message`, `room:leave`, `room:close`, `user:request`, `user:approve`, `user:deny`, `queue:flush`, etc.).
- Define all REST API routes.

---

### Phase 1 — Project Setup *(~2 days)*

- Initialize React Native (Expo) project with TypeScript.
- Initialize React + Vite admin project with TypeScript.
- Initialize Node.js + Express server project with TypeScript (or at minimum JSDoc types).
- Set up GitHub repo with `/mobile`, `/admin`, `/server` monorepo structure.
- Configure ESLint + Prettier for all three projects.
- Set up `.env` files with documented variable names.
- Install and configure NativeWind v4.
- Install and configure React Native Reanimated 3.
- Set up Theme system skeleton (`ThemeProvider`, `useTheme`, three placeholder theme files).
- **Test WebCrypto**: Generate RSA keypair, encrypt/decrypt a test string, confirm it works on both platforms. If it fails, switch to `react-native-quick-crypto` now.

---

### Phase 2 — Backend Core *(~5 days)*

#### REST API Routes

```
POST /api/users/register       — register username + UUID
GET  /api/users/check/:name    — check if username is taken
POST /api/rooms/create         — create room (returns room code)
POST /api/rooms/join           — join room with code + password hash
GET  /api/rooms/:id/keys       — get all members' public RSA keys
POST /api/admin/login          — admin password + TOTP
POST /api/admin/refresh        — refresh JWT token
POST /api/push/register        — store/update push token
```

#### Socket.io Events

```
// Client → Server
room:request-join     — send join request to room owner
room:message          — send encrypted message blob
room:leave            — graceful leave
room:close            — owner closes room
room:promote          — owner promotes co-owner
room:approve-user     — owner/co-owner approves join request
room:deny-user        — owner/co-owner denies join request
queue:flush           — client reconnected, flush offline queue

// Server → Client
room:user-joined      — broadcast new member
room:user-left        — broadcast member leave
room:message          — route message to all members
room:join-request     — notify owner/co-owner of pending request
room:approved         — notify waiting user they were approved
room:denied           — notify waiting user they were denied
room:closed           — notify all members room was force-closed
queue:message         — deliver queued message to reconnected client
```

#### SQLite Schema

```sql
CREATE TABLE users (
  uuid TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  banned INTEGER DEFAULT 0,
  ban_reason TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE push_tokens (
  user_id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE ban_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,  -- 'ban' or 'unban'
  reason TEXT,
  admin_note TEXT,
  timestamp INTEGER NOT NULL
);
```

#### In-Memory Room Structure (Node.js)

```javascript
// RAM only — wiped on server restart or room close
rooms: {
  [roomId]: {
    name: string,
    passwordHash: string,       // PBKDF2 derived key
    owner: userId,
    coOwner: userId | null,
    members: Map<userId, { username, publicKey, socketId }>,
    pendingRequests: Map<userId, { username, socketId }>,
    messageQueue: Map<userId, encryptedBlob[]>,  // for offline users
    createdAt: timestamp
  }
}
```

#### Rate Limiting

Apply via `express-rate-limit`:

- `/api/users/register`: 3 requests per IP per hour.
- `/api/rooms/create`: 5 rooms per user UUID per hour.
- `/api/rooms/join`: 10 attempts per IP per minute (prevents password brute-force).
- `/api/admin/login`: 5 attempts per IP per 15 minutes.
- All other routes: 100 requests per IP per minute (general abuse protection).

---

### Phase 3 — Encryption Layer *(~4 days)*

#### RSA Keypair Generation

- On first launch, generate RSA-2048 keypair using WebCrypto (or `react-native-quick-crypto`).
- Store private key in `Expo SecureStore` (encrypted by the OS keychain).
- Store public key in `Expo SecureStore` too (for easy retrieval).
- Export public key as SPKI format (base64) — this is what gets sent to the server.

#### Room Join Flow

1. Client sends join request with their public key (base64 SPKI).
2. Server stores the public key in the room's in-memory member map.
3. Server broadcasts updated member list (with all public keys) to all room members.
4. Now every member has every other member's public key — they can encrypt messages for anyone.

#### Message Send Flow

```javascript
async function encryptMessage(plaintext, memberPublicKeys) {
  // 1. Generate random AES-256-GCM key
  const aesKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
  );

  // 2. Encrypt plaintext with AES key
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedMessage = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, aesKey, encode(plaintext)
  );

  // 3. Encrypt AES key for each recipient
  const encryptedKeys = {};
  for (const [userId, publicKey] of memberPublicKeys) {
    const rawAesKey = await crypto.subtle.exportKey('raw', aesKey);
    encryptedKeys[userId] = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' }, publicKey, rawAesKey
    );
  }

  return { iv: b64(iv), encryptedMessage: b64(encryptedMessage), encryptedKeys };
}
```

#### Room Password Derivation

```javascript
async function deriveRoomKey(password, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encode(password), 'PBKDF2', false, ['deriveBits']
  );
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encode(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
}
```

The `salt` is the room ID (public, stored in memory). The derived bits are base64-encoded and sent as the password proof. The server compares against its stored derived key.

---

### Phase 4 — Mobile App Screens *(~7 days)*

#### Screen List

1. **Splash Screen** — animated logo (bioluminescent glow-in effect).
2. **Onboarding / Username Setup** — shown only on first launch. Username input, availability check, confirm.
3. **Home Screen** — "Create Room" + "Join Room" buttons + active room list (locally stored).
4. **Create Room Screen** — room name input, password input (optional), confirm.
5. **Join Room Screen** — room code input, password input, send join request button.
6. **Waiting Room Screen** — "Awaiting approval from room owner…" with animated pulse. Cancel button.
7. **Chat Screen** — message list, input bar, member count badge, encryption status indicator, leave/close buttons.
8. **Member List Sheet** — bottom sheet showing all members, owner/co-owner badges, promote button (owner only).
9. **Promote Member Screen** — owner selects co-owner before leaving. Cannot leave without this if room has other members.
10. **Settings Screen** — theme switcher (Bioluminescent / Soft Glass / Terminal), notification preferences per room, clear local data option.

#### Navigation Structure

```
Root Stack
├── Splash
├── Onboarding (shown if no UUID in SecureStore)
└── Main (shown if UUID exists)
    ├── Home (Tab)
    └── Settings (Tab)
    
Modal Stack (over Main)
├── CreateRoom
├── JoinRoom
├── WaitingRoom
├── Chat
│   └── MemberList (Bottom Sheet)
└── PromoteMember
```

#### Keyboard Handling

React Native's keyboard behavior is notorious. Always use `KeyboardAvoidingView` with `behavior="padding"` on iOS and `behavior="height"` on Android. The chat input bar needs special treatment — use `react-native-keyboard-controller` (free) for smooth keyboard-aware animations instead of the default janky behavior.

---

### Phase 5 — UI, Themes & Animations *(~5 days)*

#### Bioluminescent Animations

- **Background**: Two slow-drifting radial gradients (teal top-left, violet bottom-right). Implemented as `Animated` values cycling between offset positions over 8–12 seconds. Use `useAnimatedStyle` + `withRepeat` + `withTiming`.
- **Message bubbles**: Appear with a fade + slight upward translate on send/receive (`withSpring`).
- **Join request popup**: Pulse ring animation (expanding ring that fades out, loops). `withRepeat` + `withSequence`.
- **Screen transitions**: Custom shared element transitions via React Navigation's `cardStyleInterpolator`.
- **Encryption lock icon**: Brief spin + glow on message send to indicate encryption happened.

#### CRT Effect (Terminal Mode)

```css
/* Scanline overlay — CSS repeating-linear-gradient */
background: repeating-linear-gradient(
  0deg,
  transparent,
  transparent 2px,
  rgba(0, 0, 0, 0.15) 2px,
  rgba(0, 0, 0, 0.15) 4px
);
```

In React Native, implement as an absolutely-positioned `View` with `StyleSheet` using a thin repeating pattern via SVG background or a semi-transparent overlay `View` with pointer-events disabled.

#### Fonts

Load via `@expo-google-fonts`:

- **Bioluminescent + Soft Glass**: Space Grotesk (UI text) + JetBrains Mono (timestamps, status, room codes).
- **Terminal**: IBM Plex Mono (everything monospace).

#### App Icon & Splash

- Design in **Figma** (free). Export as 1024×1024 PNG for app icon.
- Use Expo's `expo-splash-screen` for the animated splash.
- The icon concept: a stylized lock glyph with a teal glow halo on deep navy.

---

### Phase 6 — Admin Panel *(~5 days)*

#### Pages

1. **Login** — password field + TOTP 6-digit code. On success, receives JWT + refresh token (httpOnly cookie).
2. **2FA Setup** (first run only) — QR code displayed, verify with Google Authenticator, confirm.
3. **Dashboard** — live stats via Socket.io: CPU %, RAM %, uptime, active rooms, connected users. Recharts line graphs for CPU/RAM over time (last 30 data points).
4. **Rooms** — table of active rooms (name, member count, owner, created time). Force-close button. Click room to see member list.
5. **Users** — full user table with search. Columns: username, UUID (truncated), registered date, last seen, status (online/offline/banned). Ban/unban button. Admin can also rename username.
6. **Broadcast** — textarea + room selector (specific room or all rooms). Sends as a system message (visually distinct in chat).
7. **Admin Join** — enter a room code + password (or use admin override). Sends join request to room owner. In the chat, admin presence is shown with a special badge.
8. **Ban Log** — audit trail of all ban/unban actions with timestamps and reasons.

#### JWT Strategy

```javascript
// Access token: 15 min expiry
const accessToken = jwt.sign({ role: 'admin' }, SECRET, { expiresIn: '15m' });

// Refresh token: 24h expiry, stored in httpOnly cookie
const refreshToken = jwt.sign({ role: 'admin' }, REFRESH_SECRET, { expiresIn: '24h' });

// /api/admin/refresh endpoint — validates refresh token, issues new access token
// On server restart, all refresh tokens are invalidated (stateless — acceptable for single admin)
```

---

### Phase 7 — Integration & Testing *(~4 days)*

#### Test Checklist

**Encryption**
- [ ] Encrypt on Device A, decrypt on Device B — message is readable.
- [ ] Server logs never contain plaintext message content.
- [ ] New member joining mid-conversation cannot decrypt previous messages (they lack prior AES keys).

**Offline Queue**
- [ ] Send messages while offline — they appear as "Queued" with offline indicator.
- [ ] Reconnect — messages are flushed in correct order.
- [ ] App killed and restarted — queued messages persist in SQLite and flush on next connect.

**Ownership Model**
- [ ] Owner tries to leave with other members present — forced to promote co-owner first.
- [ ] Only one member in room — owner can leave and room closes automatically.
- [ ] Co-owner can approve/deny join requests.
- [ ] Owner closes room — all members get `room:closed` event, messages cleared.

**Push Notifications**
- [ ] App in background — notification received when new message arrives.
- [ ] App in foreground — no notification (message appears in chat directly).
- [ ] Tapping notification deep-links to correct room.
- [ ] Notification content never reveals message text.

**Admin**
- [ ] TOTP 2FA blocks access with wrong code.
- [ ] JWT expires after 15 min — refresh token silently re-auths.
- [ ] Force-close room from admin panel — all members disconnected.
- [ ] Ban user — they cannot rejoin any room until unbanned.
- [ ] Rate limiting — verify `/api/rooms/join` blocks after 10 rapid attempts.

**Load Test**
- [ ] 10 concurrent rooms, 5 users each — server stable.
- [ ] 50 rapid messages in one room — no message loss, correct order.

---

### Phase 8 — Polish & Deployment *(~3 days)*

#### Server Deployment (Railway)

```bash
# railway.toml
[build]
builder = "nixpacks"
buildCommand = "npm install"

[deploy]
startCommand = "node server/index.js"
healthcheckPath = "/health"
restartPolicyType = "on-failure"
```

Set environment variables in Railway dashboard: `JWT_SECRET`, `REFRESH_SECRET`, `ADMIN_PASSWORD_HASH`, `ADMIN_TOTP_SECRET`, `PORT`.

#### Admin Dashboard Deployment (Vercel)

```bash
cd admin
vercel deploy --prod
```

Set `VITE_API_URL` to the Railway server URL.

#### Mobile Build (Expo EAS)

```bash
# iOS
eas build --platform ios --profile production

# Android
eas build --platform android --profile production
```

**eas.json:**
```json
{
  "build": {
    "production": {
      "env": {
        "EXPO_PUBLIC_API_URL": "https://your-server.railway.app"
      }
    }
  }
}
```

#### App Store Checklist (iOS — $99/year)

- Privacy Policy URL required (write a simple one — the app stores no messages server-side, emphasize this).
- App description emphasizing end-to-end encryption.
- Export compliance: select "Yes, this app uses encryption" → qualifies as exempt (standard algorithm, non-military).
- Screenshots for 6.7" iPhone, 6.1" iPhone, 12.9" iPad Pro.

#### Play Store Checklist (Google — $25 one-time)

- Privacy Policy URL required (same as iOS).
- Data safety form: declare "No data collected" for messages (true — server never stores them).
- Declare encryption use.
- Target API level: 34 (Android 14) — required for new submissions.

#### README Contents

- Architecture overview (the security diagram).
- Setup instructions for self-hosting the server.
- How to configure admin 2FA.
- Environment variable reference.
- How to run EAS builds.

---

## 8. Total Estimated Timeline

| Phase | Description | Time |
|---|---|---|
| 0 | Design & Architecture Decisions | 1 day |
| 1 | Project Setup | 2 days |
| 2 | Backend Core | 5 days |
| 3 | Encryption Layer | 4 days |
| 4 | Mobile App Screens | 7 days |
| 5 | UI, Themes & Animations | 5 days |
| 6 | Admin Panel | 5 days |
| 7 | Integration & Testing | 4 days |
| 8 | Polish & Deployment | 3 days |
| **Total** | | **~36 days** |

> With heavy AI assistance: **5–6 weeks part-time**, or **3 weeks full-time**.
>
> The extra 5 days vs v1 accounts for: Phase 0 design work, the more complex group encryption model, push notifications, the identity/username system, keyboard handling improvements, and the tri-theme system.

---

## 9. Known Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| WebCrypto instability on Android | Medium | High | Test in Phase 0; fallback to `react-native-quick-crypto` |
| Railway free tier limitations | Medium | Medium | Upgrade to $5/month hobby plan if needed |
| Apple App Store rejection (encryption) | Low | High | Use standard exempt encryption declaration |
| Android keyboard handling bugs | High | Medium | Use `react-native-keyboard-controller` from the start |
| Group encryption payload size (large rooms) | Low | Medium | Limit rooms to 20 members max in v1 |
| Server RAM spike (many rooms) | Low | Medium | Add room count limit per server instance |

---

## 10. Assets — Where to Get Them

### Icons & UI Icons
- **[Lucide Icons](https://lucide.dev)** — clean, open source, React Native compatible (free).
- **[Phosphor Icons](https://phosphoricons.com)** — great variety, free.
- **[Expo Vector Icons](https://icons.expo.fyi)** — built into Expo, no install needed (free).

### Fonts
- **[Google Fonts](https://fonts.google.com)** — free. Load via `@expo-google-fonts`.
  - Space Grotesk (UI text, Bioluminescent + Glass modes)
  - JetBrains Mono (timestamps, room codes, status)
  - IBM Plex Mono (Terminal mode — all text)
  - DM Sans (Soft Glass mode UI text)

### Background / Texture Assets
- **[Haikei](https://haikei.app)** — generate custom bioluminescent wave/blob SVGs (free).
- **[SVGBackgrounds.com](https://www.svgbackgrounds.com)** — free SVG patterns.

### App Icon & Splash Screen
- Design in **[Figma](https://figma.com)** (free). Export as 1024×1024 PNG.
- 💰 **[Figma Professional](https://figma.com/pricing)** ($15/month) — only worth it if you want advanced prototyping; free tier is sufficient for asset export.
- Use Expo's splash screen tooling to auto-resize.

### Sounds (optional)
- **[Mixkit](https://mixkit.co/free-sound-effects/)** — free, no attribution required.
- **[Freesound](https://freesound.org)** — large library; check individual licenses.

---

*SecureChat Project Plan v2 — Updated with: identity system, group encryption model, PBKDF2 password derivation, push notifications, tri-theme architecture, rate limiting, CORS/JWT security hardening, risk table, and detailed Socket.io + REST API event schemas.*
