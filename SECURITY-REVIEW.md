# 🔒 Security Code Review: hochzeit-natascha-florian-clean

**Datum:** 2026-03-12  
**Reviewer:** task-worker (OpenCode/Ollama)  
**Scope:** Authentifizierung & Autorisierung, API-Routen, Datenbank-Handling

---

## 🔴 KRITISCHE SICHERHEITSLÜCKEN (CVSS 7.0-10.0)

### 1. Debug-Route exponiert Umgebungsvariablen
**Datei:** `app/api/debug/route.ts`  
**Schweregrad:** 🔴 CVSS 8.6 (High)

```typescript
// PROBLEMATISCH:
return NextResponse.json({
  env: {
    UPSTASH_REDIS_REST_URL: hasRedisUrl ? '✅ Set' : '❌ Missing',
    UPSTASH_REDIS_REST_TOKEN: hasRedisToken ? '✅ Set' : '❌ Missing', // Zeigt an ob Token existiert
    NODE_ENV: process.env.NODE_ENV,
  },
  message: 'Debug info - remove in production',
})
```

**Risiko:**
- Angreifer kann erkennen, ob Redis-Token gesetzt ist
- Hinweis auf interne Infrastruktur (Upstash)
- Leak von `NODE_ENV` kann für weitere Angriffe genutzt werden
- Route ist nicht geschützt - öffentlich zugänglich

**Fix:**
```typescript
// LÖSCHEN oder zumindest:
export async function GET(request: NextRequest) {
  // IP-Whitelist oder interne Netzwerk-Prüfung
  const clientIp = request.ip || request.headers.get('x-forwarded-for')
  if (!isInternalIp(clientIp)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // ...
}
```

---

### 2. Base64-"JWT" ohne kryptographische Signatur
**Datei:** `lib/auth-utils.ts`  
**Schweregrad:** 🔴 CVSS 9.1 (Critical)

```typescript
// PROBLEMATISCH:
export function createSessionToken(session: AuthSession): string {
  const payload = {
    ...session,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(session.expiresAt / 1000),
  }
  return Buffer.from(JSON.stringify(payload)).toString('base64') // ❌ Keine Signatur!
}

export function parseSessionToken(token: string): AuthSession | null {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'))
    // ❌ Keine Signatur-Validierung!
    if (decoded.expiresAt < Date.now()) return null
    return decoded
  } catch { return null }
}
```

**Risiko:**
- Jeder kann Token manipulieren (Base64 ist kein Verschlüsselung)
- Angreifer kann `role: "admin"` hinzufügen
- Keine Integritätsprüfung möglich
- Session-Tokens sind trivial fälschbar

**Exploit-Beispiel:**
```bash
# Original Token decodieren
echo "eyJyb2xlIjoiZ3Vlc3Qi..." | base64 -d
# Output: {"role":"guest",...}

# Admin-Token erstellen
echo '{"role":"admin","email":"attacker@evil.com","expiresAt":9999999999999}' | base64
# Ergebnis als Cookie senden → Admin-Zugriff
```

**Fix:**
```typescript
import { SignJWT, jwtVerify } from 'jose' // oder 'jsonwebtoken'

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET)

export async function createSessionToken(session: AuthSession): Promise<string> {
  return await new SignJWT({ ... })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(JWT_SECRET)
}

export async function parseSessionToken(token: string): Promise<AuthSession | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as AuthSession
  } catch { return null }
}
```

---

### 3. localStorage für Session-Token (XSS-Anfällig)
**Datei:** `lib/auth-utils.ts`  
**Schweregrad:** 🔴 CVSS 7.1 (High)

```typescript
// PROBLEMATISCH:
export function saveSessionToStorage(token: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(SESSION_KEY, token) // ❌ XSS-Risiko
}
```

**Risiko:**
- Bei XSS-Angriff kann Angreifer Token auslesen: `localStorage.getItem('hochzeit_auth_session')`
- Token wird im Klartext gespeichert
- Keine `httpOnly`- oder `Secure`-Flags möglich

**Fix:**
```typescript
// Server-seitige Session in Cookie
// app/api/auth/login/route.ts
import { cookies } from 'next/headers'

export async function POST(req: Request) {
  const { token } = await authenticate(req)
  
  const cookieStore = await cookies()
  cookieStore.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  })
  
  return Response.json({ success: true })
}
```

---

### 4. Hardcoded Passwörter
**Datei:** `lib/db-memory.ts`  
**Schweregrad:** 🔴 CVSS 8.5 (High)

```typescript
// PROBLEMATISCH:
async function initializeDefaults() {
  const adminPassword1 = await bcrypt.hash('changeme123', 10) // ❌ Hardcoded!
  const adminPassword2 = await bcrypt.hash('changeme456', 10) // ❌ Hardcoded!
  // ...
}
```

**Risiko:**
- Passwörter sind im Quellcode sichtbar
- Selbst wenn gehasht, kann "changeme123" geraten/gerainbow-tabled werden
- Entwickler/CI hat Zugriff auf Produktions-Passwörter

**Fix:**
```typescript
// In .env Datei:
// INITIAL_ADMIN_PASSWORD_HASH=$2b$10$...
// oder besser: Setup-Endpoint oder CLI-Tool

async function initializeDefaults() {
  const adminHash = process.env.INITIAL_ADMIN_PASSWORD_HASH
  if (!adminHash) {
    console.warn('No initial admin configured')
    return
  }
  // ...
}
```

---

### 5. localStorage serverseitig in API-Route
**Datei:** `src/app/api/admin/guests/route.ts` (VERALTET)  
**Schweregrad:** 🔴 CVSS 9.8 (Critical)

```typescript
// PROBLEMATISCH:
if (!token || token !== localStorage.getItem('hochzeit_auth_session')) {
  // ❌ localStorage existiert serverseitig NICHT!
  return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 })
}
```

**Risiko:**
- `localStorage` ist eine Browser-API, existiert nicht in Node.js/Next.js API Routes
- Dieser Code wirft einen Fehler oder ist immer `undefined`
- Authentifizierung ist komplett defekt/bypassed
- Jeder Request ist autorisiert!

**Fix:**
```typescript
// Korrekte serverseitige Auth:
const authHeader = request.headers.get('authorization')
if (!authHeader?.startsWith('Bearer ')) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

const token = authHeader.slice(7)
const session = await parseSessionToken(token) // Mit echter JWT-Validierung
if (!session || session.role !== 'admin') {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
```

---

## 🟡 CODE QUALITY ISSUES

### 6. Fehlende Input-Validierung
**Datei:** `app/api/admin/guests/route.ts`

```typescript
// Email nicht validiert, Code nicht normalisiert
const guest = createGuest({ name, email, code }) // Keine Sanitization
```

**Fix:**
```typescript
import { z } from 'zod'

const GuestSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  code: z.string().regex(/^[A-Z0-9]{6,12}$/),
})

const { name, email, code } = GuestSchema.parse(body)
```

### 7. Duplizierter/Veralteter Code in `src/app/`
**Datei:** `src/app/api/admin/guests/route.ts`

Das Projekt hat zwei App-Verzeichnisse:
- `/app/` (Next.js 13+ App Router - aktiv)
- `/src/app/` (veraltet, falscher Code)

**Fix:** Lösche `/src/app/` komplett.

### 8. Fehlende Rate-Limiting
**Datei:** `app/api/admin/guests/route.ts`

Kein Schutz gegen Brute-Force auf Login-Endpunkte.

**Fix:**
```typescript
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '1 m'),
})

export async function POST(request: NextRequest) {
  const ip = request.ip ?? '127.0.0.1'
  const { success } = await ratelimit.limit(ip)
  if (!success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  // ...
}
```

### 9. Fehlende CSRF-Schutz für Mutations
**Datei:** Alle API Routes

Kein CSRF-Token für POST/DELETE-Operationen.

### 10. Race Condition bei Gasterstellung
**Datei:** `lib/db-memory.ts`

```typescript
// Keine atomare Operation
const existingGuest = guestsMap.get(code) // Check
// ...
guestsMap.set(data.code, guest) // Create (non-atomic)
```

---

## 🟢 BEST PRACTICES (Empfohlene Verbesserungen)

### 11. Verwende sichere Zufallszahlengenerierung
```typescript
// Aktuell: Math.random() - nicht kryptographisch sicher
const code = Math.random().toString(36).substring(2, 8).toUpperCase()

// Besser:
import { randomBytes } from 'crypto'
const code = randomBytes(4).toString('hex').toUpperCase()
```

### 12. Einheitliche Fehlerbehandlung
```typescript
// Erstelle eine zentrale Error-Klasse
class AuthenticationError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message)
  }
}
```

### 13. Audit-Logging
```typescript
// Logge alle Admin-Aktionen
console.log(`[AUDIT] ${session.email} deleted guest ${code} at ${new Date().toISOString()}`)
```

### 14. Content Security Policy (CSP)
```typescript
// next.config.js
module.exports = {
  async headers() {
    return [{
      source: '/(.*)',
      headers: [{
        key: 'Content-Security-Policy',
        value: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
      }]
    }]
  }
}
```

---

## 📋 PRIORISIERTE FIX-LISTE

| Priorität | Issue | Datei | Aufwand |
|-----------|-------|-------|---------|
| P0 | 🔴 Base64-JWT → echtes JWT | `lib/auth-utils.ts` | 2h |
| P0 | 🔴 localStorage serverseitig | `src/app/api/admin/guests/route.ts` | Löschen |
| P0 | 🔴 Debug-Route entfernen | `app/api/debug/route.ts` | 5min |
| P0 | 🔴 Hardcoded Passwörter | `lib/db-memory.ts` | 30min |
| P1 | 🔴 localStorage → httpOnly Cookies | `lib/auth-utils.ts` | 3h |
| P1 | 🟡 Input-Validierung | `app/api/admin/guests/route.ts` | 1h |
| P1 | 🟡 Rate-Limiting | Alle API Routes | 2h |
| P2 | 🟡 CSRF-Schutz | - | 2h |
| P2 | 🟢 Audit-Logging | - | 1h |
| P2 | 🟢 CSP Header | `next.config.js` | 30min |

---

## 🎯 GESAMTBEWERTUNG AUTH-IMPLEMENTIERUNG

| Kategorie | Bewertung | Begründung |
|-----------|-----------|------------|
| **Token-Design** | ❌ FAIL | Base64 statt JWT, keine Signatur |
| **Token-Speicherung** | ❌ FAIL | localStorage statt httpOnly Cookies |
| **Session-Management** | ⚠️ WARNUNG | Keine serverseitige Session-Speicherung |
| **Passwort-Sicherheit** | ⚠️ WARNUNG | bcrypt okay, aber hardcoded Passwörter |
| **API-Sicherheit** | ❌ FAIL | Kein Rate-Limiting, keine CSRF-Schutz |
| **Code-Qualität** | ⚠️ WARNUNG | Veraltete Dateien, Inkonsistenzen |

### Gesamtscore: **2/10** 🔴

Die Auth-Implementierung ist für einen Produktionseinsatz **NICHT SICHER**. Die kritischsten Probleme:
1. Token-Manipulation trivial möglich (keine Signatur)
2. Auth-Routen haben defekte/bypassed Auth-Checks
3. Session-Tokens XSS-anfällig gespeichert

### Empfohlene Architektur-Änderung:
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Client        │────▶│  Next.js API    │────▶│   Upstash       │
│   (Browser)     │     │  (Middleware)   │     │   Redis         │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        │ httpOnly Cookie       │ JWT Verify            │ Session Store
        │ (session=xxx)         │ + Rate Limit          │ + Audit Log
        └───────────────────────┘                       │
                                                          │
                                ┌───────────────────────┘
                                ▼
                         ┌─────────────────┐
                         │  Admin/Guest    │
                         │  Auth Logic     │
                         └─────────────────┘
```

---

*Review erstellt durch OpenCode Multi-Agent System*
