# DialKaro — Product Default Config

> ⚠️ This is NOT a client. This is the **product default tenant** used for:
> - Public landing page at `dialkaro.celerapps.com`
> - Demo/showcase to prospects
> - Development and testing on localhost

## Default Branding (hardcoded in auth.js)

| Field | Value |
|-------|-------|
| **App Name** | DialKaro |
| **Subtitle** | Dial Faster · Close Smarter |
| **Emoji** | ☎️ |
| **Tagline** | Your team's calling command centre |

## How It Works

1. When anyone visits `dialkaro.celerapps.com`, they see the DialKaro product page
2. The `tenants` table has a `dialkaro` row as the default
3. Clients share the same URL — their branding loads when they login or register with their Team Code
4. The landing page always shows DialKaro (the product), which is correct

## Demo Admin Credentials
| Field | Value |
|-------|-------|
| **Team Code** | `DIALKARO` |
| **Admin Pass** | *(hardcoded default in auth.js)* |

## Database Row
```sql
SELECT * FROM tenants WHERE slug = 'dialkaro';
```
