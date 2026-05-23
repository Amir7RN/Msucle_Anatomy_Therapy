# Auth Quick Reference Card

## Environment Setup (2 minutes)

```bash
# 1. Create .env.local
echo "VITE_SUPABASE_URL=https://your-id.supabase.co" > .env.local
echo "VITE_SUPABASE_ANON_KEY=your-key-here" >> .env.local

# 2. Install & run
npm install
npm run dev
```

## Login at: `http://localhost:5173`

---

## Using Auth in Components

### Get Current User
```tsx
import { useAuth } from '@/lib/auth/authContext'

function MyComponent() {
  const { user, isAuthenticated, isLoading } = useAuth()
  
  if (isLoading) return <p>Loading...</p>
  if (!isAuthenticated) return <p>Please log in</p>
  
  return <p>Welcome, {user?.email}</p>
}
```

### Sign In / Out
```tsx
import { useSignIn, useSignOut } from '@/lib/auth/useAuth'

function LoginButton() {
  const { execute: signIn, isLoading, error } = useSignIn()
  
  const handleLogin = async () => {
    const success = await signIn('user@example.com', 'password123')
    if (success) console.log('Logged in!')
  }
  
  return <button onClick={handleLogin}>{isLoading ? 'Signing in...' : 'Login'}</button>
}
```

### Sign Up
```tsx
import { useSignUp } from '@/lib/auth/useAuth'

const { execute: signUp, isLoading, error } = useSignUp()
await signUp('newuser@example.com', 'password123')
```

### Password Reset
```tsx
import { useResetPassword } from '@/lib/auth/useAuth'

const { execute: reset, isLoading, success } = useResetPassword()
await reset('user@example.com')
```

---

## ROM History (Now Async!)

### Load History
```tsx
import { loadROMHistory } from '@/lib/movement/romHistory'

// In useEffect:
useEffect(() => {
  const load = async () => {
    const history = await loadROMHistory()
    console.log(history)
  }
  load()
}, [])
```

### Save Record
```tsx
import { saveROMRecord } from '@/lib/movement/romHistory'

const record = {
  muscleId: 'biceps_brachii',
  movementId: 'elbow_flexion',
  side: 'R',
  angle: 145,
  reference: 150,
  ts: Date.now(),
}

await saveROMRecord(record) // Auto-saves to Supabase if logged in
```

### Get Records for Muscle
```tsx
import { getRecordsFor } from '@/lib/movement/romHistory'

const records = await getRecordsFor('biceps_brachii', 'elbow_flexion', 'R')
```

### Migrate Old Data
```tsx
import { migrateLocalStorageToSupabase } from '@/lib/movement/romHistory'

const count = await migrateLocalStorageToSupabase('device-123')
console.log(`Migrated ${count} records`)
```

---

## Supabase Dashboard

**Project URL**: Settings → API → Project URL  
**Anon Key**: Settings → API → Anon Public  
**Database**: SQL Editor → (run queries)  
**Auth Users**: Authentication → Users  
**Data**: Table Editor → rom_history  

---

## API Key Locations (Supabase)

```
Settings
├── API
│   ├── Project URL          ← Copy this
│   ├── Project API keys
│   │   ├── anon public      ← Use THIS one
│   │   └── service role     ← NOT this
```

---

## Database Schema at a Glance

```sql
-- Users table (managed by Supabase)
auth.users
├── id         UUID
├── email      TEXT
└── ...

-- Your data table
rom_history
├── id         UUID
├── user_id    UUID (links to auth.users)
├── muscle_id  TEXT
├── movement_id TEXT
├── side       'L' | 'R'
├── angle      FLOAT
├── reference  FLOAT
└── created_at TIMESTAMP
```

---

## Workflow

1. User visits app → **LoginPage** (not authenticated)
2. User signs up → Account created in Supabase
3. User logs in → Session restored, app loads
4. User runs assessment → ROM saved to `rom_history` table
5. User logs out → Session cleared, back to LoginPage
6. User logs back in → ROM history loads from Supabase

---

## Testing Commands

```bash
# Watch logs
npm run dev

# Check environment
cat .env.local

# Clear localStorage (in browser console)
localStorage.clear()

# Check auth state (in browser console)
JSON.parse(localStorage.getItem('sb-xxx-auth-token'))
```

---

## Common Errors & Fixes

| Error | Fix |
|-------|-----|
| "Invalid API key" | Check `.env.local`, restart dev server |
| "User not found" | Verify RLS policies in Supabase |
| "Network error on login" | Check Supabase project is running |
| Session lost on refresh | Clear browser cookies & log in again |
| ROM not syncing | Check if user is logged in, verify Supabase |

---

## Files at a Glance

| File | Purpose |
|------|---------|
| `src/lib/supabase.ts` | Supabase client |
| `src/lib/auth/authContext.tsx` | Auth context & provider |
| `src/lib/auth/useAuth.ts` | Custom hooks |
| `src/components/auth/LoginPage.tsx` | Login/signup UI |
| `src/lib/movement/romHistory.ts` | Per-user data storage |
| `src/App.tsx` | Auth provider & guards |
| `.env.local` | Your Supabase credentials |

---

## Development Tips

✅ **Always await** ROM history functions—they're async now  
✅ **Wrap in useEffect** when loading data in components  
✅ **Check isLoading** from auth hooks before rendering  
✅ **Use useState** for async data in components  
✅ **Check browser console** for helpful error messages  
✅ **Test logout** to ensure session clears  
✅ **Test on different browser** to verify persistence  

---

## One-Liner Commands

```bash
# View current env
grep VITE .env.local

# Check npm version
npm -v

# Clear cache
rm -rf node_modules && npm install

# Check for TypeScript errors
npx tsc --noEmit

# Open Supabase dashboard
open https://app.supabase.com
```

---

## Need Help?

1. **Check docs**: `AUTH_IMPLEMENTATION_GUIDE.md`
2. **Check console**: F12 → Console tab
3. **Check Supabase**: Dashboard → Logs
4. **Check env**: `cat .env.local` (make sure values are correct)
