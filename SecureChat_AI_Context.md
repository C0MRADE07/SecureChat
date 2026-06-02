# SecureChat — Master AI Context Document

> Paste this entire document at the start of any AI conversation. After reading it, the AI has full context of the project and you can simply say "generate [filename]" and it will produce the correct, complete, ready-to-paste file.

---

## What You Are Helping Build

SecureChat is a mobile-first end-to-end encrypted messaging app for iOS and Android. It has three parts:

1. **Mobile app** — React Native (Expo), iOS + Android.
2. **Backend server** — Node.js + Express + Socket.io.
3. **Admin dashboard** — React + Vite web app.

The project lives in a monorepo with three root folders: `mobile/`, `server/`, `admin/`.

---

## Core Concept

- Users join or create **password-protected rooms**.
- All messages are **end-to-end encrypted** — the server never sees plaintext.
- Rooms are **ephemeral** — everything lives in server RAM. When a room closes or the server restarts, all messages and room data are gone permanently.
- There is **no user account system** — identity is a UUID generated on first app launch, stored in device SecureStore. The user picks a username once.
- The server stores only: usernames, UUIDs, ban list, push tokens. Nothing else is persisted to disk.

---

## Identity System

- On first launch, the app generates a **UUID v4** as the user's permanent device identity.
- Stored in `Expo SecureStore` — survives app restarts, wiped on uninstall.
- User picks a **username** (3–20 chars, alphanumeric, unique per server). Registered via REST API.
- Username cannot be changed by the user. Admin can rename via admin panel.
- No passwords, no email, no login screen — identity is purely device-based.

---

## Encryption Architecture

### Keypair
- On first launch, generate **RSA-2048 keypair** using WebCrypto (fallback: `react-native-quick-crypto`).
- Private key stored in `Expo SecureStore`.
- Public key exported as **base64 SPKI** format — sent to server on room join.
- Server stores public keys in RAM only (never to disk).

### Message Encryption (Hybrid)
Every message uses hybrid encryption:

1. Generate a random **AES-256-GCM key** for this message.
2. Encrypt the plaintext with the AES key + random IV.
3. For **each room member**, encrypt the AES key with their **RSA public key** (RSA-OAEP).
4. Send payload: `{ iv, encryptedMessage, encryptedKeys: { userId: encryptedAESKey, ... } }`
5. Server routes the blob to all members — server sees only ciphertext.
6. Each recipient decrypts their copy of the AES key with their RSA private key, then decrypts the message.

### Room Password Derivation
- Use **PBKDF2-SHA256**, 100,000 iterations.
- Salt = roomId (public).
- Client derives key from user's password input, sends derived key to server.
- Server stores derived key only — never raw password.
- Never use plain SHA-256 for password derivation.

---

## Tech Stack

### Mobile (`mobile/`)
| Package | Purpose |
|---|---|
| `expo` (SDK 51+) | Toolchain, OTA updates, EAS builds |
| `react-native` | Core framework |
| `expo-crypto` / WebCrypto | RSA + AES crypto |
| `react-native-quick-crypto` | Fallback if WebCrypto fails on Android |
| `expo-secure-store` | Store private key + UUID |
| `expo-sqlite` | Offline message queue |
| `expo-notifications` | Push notification token |
| `react-navigation` v6 | Stack + Bottom Tab navigation |
| `socket.io-client` | WebSocket connection to server |
| `zustand` | Global state management |
| `react-native-reanimated` v3 | Animations (runs on native thread) |
| `nativewind` v4 | Tailwind CSS for React Native |
| `react-native-mmkv` | Fast key-value storage (theme, settings) |
| `react-native-keyboard-controller` | Smooth keyboard-aware chat input |
| `@expo-google-fonts/space-grotesk` | UI font |
| `@expo-google-fonts/jetbrains-mono` | Monospace font |
| `@expo-google-fonts/ibm-plex-mono` | Terminal mode font |
| `@expo-google-fonts/dm-sans` | Soft Glass mode font |

### Server (`server/`)
| Package | Purpose |
|---|---|
| `express` | HTTP server + REST API |
| `socket.io` | WebSocket server |
| `better-sqlite3` | SQLite database |
| `bcrypt` | Admin password hashing |
| `jsonwebtoken` | Admin JWT auth |
| `speakeasy` | TOTP 2FA |
| `qrcode` | Generate 2FA QR code |
| `express-rate-limit` | Rate limiting |
| `helmet` | Secure HTTP headers |
| `expo-server-sdk` | Send push notifications |
| `node-os-utils` | CPU/RAM/uptime stats |
| `cors` | CORS configuration |

### Admin (`admin/`)
| Package | Purpose |
|---|---|
| `react` + `vite` | Frontend framework |
| `tailwindcss` | Styling |
| `axios` | HTTP requests + JWT interceptor |
| `recharts` | CPU/RAM live graphs |
| `socket.io-client` | Live stats feed |
| `otpauth` | TOTP verification |
| `zustand` | Auth state |

---

## Database Schema (SQLite — server only)

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
  action TEXT NOT NULL,
  reason TEXT,
  admin_note TEXT,
  timestamp INTEGER NOT NULL
);
```

---

## In-Memory Room Structure (server RAM only)

```typescript
interface Room {
  id: string;
  name: string;
  passwordHash: string;        // PBKDF2 derived key
  owner: string;               // userId
  coOwner: string | null;
  members: Map<string, {
    username: string;
    publicKey: string;         // base64 SPKI
    socketId: string;
  }>;
  pendingRequests: Map<string, {
    username: string;
    socketId: string;
    publicKey: string;
  }>;
  messageQueue: Map<string, EncryptedPayload[]>; // offline queue per user
  createdAt: number;
}

// Global room store
const rooms = new Map<string, Room>();
```

---

## REST API Routes

```
POST   /api/users/register        — { uuid, username } → register user
GET    /api/users/check/:username  — check if username is taken
POST   /api/rooms/create          — { userId, name, passwordHash } → { roomId, roomCode }
POST   /api/rooms/join            — { userId, roomCode, passwordHash } → join or request
GET    /api/rooms/:id/keys        — { userId } → all members' public keys
POST   /api/admin/login           — { password, totpCode } → { accessToken } + set cookie
POST   /api/admin/refresh         — (cookie) → { accessToken }
POST   /api/push/register         — { userId, token } → store push token
```

---

## Socket.io Events

```
// Client → Server
room:message          — { roomId, payload: EncryptedPayload }
room:leave            — { roomId }
room:close            — { roomId }  (owner only)
room:promote          — { roomId, targetUserId }
room:approve-user     — { roomId, targetUserId }
room:deny-user        — { roomId, targetUserId }
queue:flush           — { roomId }  (on reconnect)

// Server → Client
room:message          — { payload: EncryptedPayload, senderId, timestamp }
room:user-joined      — { userId, username, publicKey }
room:user-left        — { userId, username }
room:join-request     — { userId, username, publicKey }
room:approved         — { roomId, roomName, members[] }
room:denied           — { roomId }
room:closed           — { roomId }
room:promoted         — { newCoOwner: userId }
queue:message         — { payload: EncryptedPayload, senderId, timestamp }
server:stats          — { cpu, ram, uptime, roomCount, userCount }  (admin only)
```

---

## Message Payload Type

```typescript
interface EncryptedPayload {
  iv: string;                          // base64 encoded IV
  encryptedMessage: string;            // base64 AES-GCM ciphertext
  encryptedKeys: {
    [userId: string]: string;          // base64 RSA-encrypted AES key per recipient
  };
  senderId: string;
  timestamp: number;
  messageId: string;                   // UUID, for queue dedup
}

type MessageStatus = 'queued' | 'sent' | 'delivered';
```

---

## Rate Limits

```
POST /api/users/register     — 3 requests / IP / hour
POST /api/rooms/create       — 5 requests / UUID / hour
POST /api/rooms/join         — 10 requests / IP / minute
POST /api/admin/login        — 5 requests / IP / 15 minutes
All other routes             — 100 requests / IP / minute
```

---

## JWT Strategy (Admin)

- **Access token**: 15 minute expiry. Sent as `Authorization: Bearer <token>` header.
- **Refresh token**: 24 hour expiry. Stored as `httpOnly` cookie.
- Axios interceptor on admin frontend: on 401, call `/api/admin/refresh`, retry original request.
- On server restart, all sessions invalidated (stateless, acceptable for single admin).

---

## Theme System

Three themes, stored in MMKV, applied globally via React Context (`ThemeProvider`).

### Bioluminescent (Dark — Default)
```typescript
{
  bg: '#050d1a',
  surface: '#0a1628',
  accent: '#00f5d4',        // teal
  accentSecondary: '#7b2ff7', // violet
  text: '#e0f0ff',
  textMuted: '#3a6070',
  border: 'rgba(0,245,212,0.15)',
  messageSent: '#0d2137',
  messageReceived: '#071520',
  fontUI: 'SpaceGrotesk',
  fontMono: 'JetBrainsMono',
  animated: true,
}
```

### Soft Glass (Light)
```typescript
{
  bg: '#f0f4f8',
  surface: 'rgba(255,255,255,0.6)',
  accent: '#5b8dee',
  accentSecondary: '#a78bfa',
  text: '#1a1a2e',
  textMuted: '#6b7280',
  border: 'rgba(0,0,0,0.08)',
  messageSent: 'rgba(91,141,238,0.15)',
  messageReceived: 'rgba(255,255,255,0.8)',
  fontUI: 'DMSans',
  fontMono: 'JetBrainsMono',
  animated: false,
}
```

### Terminal (Hacker)
```typescript
{
  bg: '#000000',
  surface: '#0a0a0a',
  accent: '#00c832',        // phosphor green
  accentSecondary: '#007a1e',
  text: '#00c832',
  textMuted: '#1a5a1a',
  border: '#1a3a1a',
  messageSent: '#001a00',
  messageReceived: '#000000',
  fontUI: 'IBMPlexMono',
  fontMono: 'IBMPlexMono',
  animated: false,
  crtEffect: true,
}
```

---

## Navigation Structure

```
RootNavigator (Stack)
├── SplashScreen
├── OnboardingScreen        — shown only if no UUID in SecureStore
└── MainNavigator (Bottom Tab)
    ├── HomeScreen
    ├── SettingsScreen
    └── ModalNavigator (Stack — overlays Main)
        ├── CreateRoomScreen
        ├── JoinRoomScreen
        ├── WaitingRoomScreen
        ├── ChatScreen
        │   └── MemberListSheet (Bottom Sheet)
        └── PromoteMemberScreen
```

---

## Complete File Structure

```
securechat/
├── mobile/
│   ├── app.json
│   ├── babel.config.js
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── package.json
│   ├── .env
│   ├── index.js
│   ├── assets/
│   │   ├── icon.png
│   │   ├── splash.png
│   │   ├── adaptive-icon.png
│   │   └── fonts/
│   │       ├── SpaceGrotesk-Regular.ttf
│   │       ├── SpaceGrotesk-Bold.ttf
│   │       ├── JetBrainsMono-Regular.ttf
│   │       └── IBMPlexMono-Regular.ttf
│   └── src/
│       ├── App.tsx
│       ├── theme/
│       │   ├── index.ts
│       │   ├── ThemeProvider.tsx
│       │   ├── bioluminescent.ts
│       │   ├── softglass.ts
│       │   ├── terminal.ts
│       │   └── types.ts
│       ├── navigation/
│       │   ├── RootNavigator.tsx
│       │   ├── MainNavigator.tsx
│       │   ├── ModalNavigator.tsx
│       │   └── types.ts
│       ├── screens/
│       │   ├── SplashScreen.tsx
│       │   ├── OnboardingScreen.tsx
│       │   ├── HomeScreen.tsx
│       │   ├── SettingsScreen.tsx
│       │   ├── CreateRoomScreen.tsx
│       │   ├── JoinRoomScreen.tsx
│       │   ├── WaitingRoomScreen.tsx
│       │   ├── ChatScreen.tsx
│       │   ├── MemberListSheet.tsx
│       │   └── PromoteMemberScreen.tsx
│       ├── components/
│       │   ├── common/
│       │   │   ├── Button.tsx
│       │   │   ├── Input.tsx
│       │   │   ├── Avatar.tsx
│       │   │   ├── Badge.tsx
│       │   │   ├── Divider.tsx
│       │   │   └── LoadingSpinner.tsx
│       │   ├── chat/
│       │   │   ├── MessageBubble.tsx
│       │   │   ├── MessageList.tsx
│       │   │   ├── ChatInput.tsx
│       │   │   ├── QueueIndicator.tsx
│       │   │   ├── EncryptionBadge.tsx
│       │   │   └── SystemMessage.tsx
│       │   ├── room/
│       │   │   ├── RoomCard.tsx
│       │   │   ├── MemberItem.tsx
│       │   │   └── JoinRequestPopup.tsx
│       │   └── animations/
│       │       ├── BioBackground.tsx
│       │       ├── PulseRing.tsx
│       │       ├── CRTOverlay.tsx
│       │       └── FadeSlideIn.tsx
│       ├── crypto/
│       │   ├── keypair.ts
│       │   ├── encrypt.ts
│       │   ├── decrypt.ts
│       │   ├── roomKey.ts
│       │   └── utils.ts
│       ├── store/
│       │   ├── userStore.ts
│       │   ├── roomStore.ts
│       │   ├── messageStore.ts
│       │   └── settingsStore.ts
│       ├── services/
│       │   ├── api.ts
│       │   ├── socket.ts
│       │   ├── notifications.ts
│       │   └── queue.ts
│       ├── hooks/
│       │   ├── useSocket.ts
│       │   ├── useEncryption.ts
│       │   ├── useRoom.ts
│       │   └── useQueue.ts
│       ├── utils/
│       │   ├── constants.ts
│       │   ├── validators.ts
│       │   ├── formatters.ts
│       │   └── storage.ts
│       └── types/
│           ├── message.ts
│           ├── room.ts
│           └── user.ts
│
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env
│   ├── .env.example
│   ├── railway.toml
│   ├── index.ts
│   └── src/
│       ├── app.ts
│       ├── config/
│       │   ├── db.ts
│       │   ├── jwt.ts
│       │   └── rateLimit.ts
│       ├── routes/
│       │   ├── users.ts
│       │   ├── rooms.ts
│       │   ├── admin.ts
│       │   └── push.ts
│       ├── socket/
│       │   ├── index.ts
│       │   ├── middleware.ts
│       │   └── handlers/
│       │       ├── roomHandlers.ts
│       │       ├── userHandlers.ts
│       │       └── queueHandlers.ts
│       ├── middleware/
│       │   ├── auth.ts
│       │   ├── validate.ts
│       │   └── errorHandler.ts
│       ├── db/
│       │   ├── schema.ts
│       │   ├── users.ts
│       │   ├── pushTokens.ts
│       │   └── banLog.ts
│       ├── rooms/
│       │   └── roomManager.ts
│       ├── services/
│       │   ├── pushService.ts
│       │   ├── totpService.ts
│       │   └── statsService.ts
│       └── types/
│           ├── room.ts
│           ├── socket.ts
│           └── express.d.ts
│
└── admin/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── .env
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── pages/
        │   ├── LoginPage.tsx
        │   ├── SetupPage.tsx
        │   ├── DashboardPage.tsx
        │   ├── RoomsPage.tsx
        │   ├── UsersPage.tsx
        │   ├── BroadcastPage.tsx
        │   ├── AdminJoinPage.tsx
        │   └── BanLogPage.tsx
        ├── components/
        │   ├── layout/
        │   │   ├── Sidebar.tsx
        │   │   ├── TopBar.tsx
        │   │   └── Layout.tsx
        │   ├── dashboard/
        │   │   ├── StatCard.tsx
        │   │   ├── CPUChart.tsx
        │   │   └── RAMChart.tsx
        │   ├── rooms/
        │   │   ├── RoomTable.tsx
        │   │   └── RoomMemberModal.tsx
        │   ├── users/
        │   │   ├── UserTable.tsx
        │   │   ├── BanModal.tsx
        │   │   └── RenameModal.tsx
        │   └── common/
        │       ├── Button.tsx
        │       ├── Input.tsx
        │       ├── Modal.tsx
        │       ├── Table.tsx
        │       ├── Badge.tsx
        │       └── Toast.tsx
        ├── services/
        │   ├── api.ts
        │   └── socket.ts
        ├── store/
        │   └── authStore.ts
        ├── hooks/
        │   ├── useStats.ts
        │   └── useAuth.ts
        └── types/
            ├── room.ts
            ├── user.ts
            └── stats.ts
```

---

## Security Rules — Never Violate These

1. Server **never logs or stores** message content — only routes encrypted blobs.
2. Private RSA key **never leaves the device** — stored in SecureStore only.
3. Room passwords **never sent as plaintext** — always PBKDF2 derived first.
4. Admin JWT access token **expires in 15 minutes** — refresh token in httpOnly cookie.
5. All endpoints protected by **express-rate-limit**.
6. **helmet.js** applied to all Express routes.
7. **CORS** configured to whitelist only the admin domain and mobile app origin.
8. Input sanitization on all user-provided fields — username, room name, messages.
9. A new member joining a room **cannot decrypt previous messages** — they only have keys for messages sent after they joined.
10. When a room closes — **all data wiped from RAM instantly**, no recovery.

---

## Environment Variables

### server/.env
```
PORT=3000
JWT_SECRET=your_jwt_secret_here
REFRESH_SECRET=your_refresh_secret_here
ADMIN_PASSWORD_HASH=bcrypt_hash_of_admin_password
ADMIN_TOTP_SECRET=generated_by_speakeasy_on_first_run
CORS_ORIGIN=https://admin.yourdomain.com
```

### mobile/.env
```
EXPO_PUBLIC_API_URL=https://your-server.railway.app
EXPO_PUBLIC_SOCKET_URL=https://your-server.railway.app
```

### admin/.env
```
VITE_API_URL=https://your-server.railway.app
```

---

## How to Generate Any File

When asked to generate a file, always:

1. Output the **complete file** — no placeholders, no `// TODO`, no omissions.
2. Use **TypeScript** throughout.
3. Follow the exact **import paths** shown in the file structure above (e.g. `../../crypto/encrypt`, `../store/userStore`).
4. Apply the **theme system** in all React Native components — never hardcode colors. Use `useTheme()` hook.
5. All Socket.io events must match **exactly** the event names listed in this document.
6. All API calls must hit the **exact routes** listed in this document.
7. Never store anything sensitive outside of `Expo SecureStore`.
8. Every crypto operation must follow the **hybrid encryption model** described above.

---

*SecureChat Master Context — v1.0. Paste at the start of any AI session to restore full project context.*
