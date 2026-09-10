# BROSAVO Google Business Profile SaaS

Multi-tenant Google Business Profile management for every BROSAVO organization.

## Architecture

```
BROSAVO API
├── Organization (tenant root)
│   ├── MarketingProviderAccount (encrypted Google OAuth)
│   ├── GoogleBusinessLocation (multi-location)
│   ├── MarketingContent (posts / drafts / scheduled)
│   ├── GoogleReview (synced reviews)
│   ├── GoogleBusinessAutomationRule
│   ├── GoogleBusinessUsage (monthly quotas)
│   └── MarketingSettings (AI + automation prefs)
```

Every query is scoped by `organizationId` from JWT (`req.auth`). Never trust `organizationId` from the client body.

## API Routes

### Marketing module (existing)
- `GET /api/v1/marketing/google/login`
- `GET /api/v1/marketing/google/callback` (public OAuth)
- `GET /api/v1/marketing/google/status`
- `GET /api/v1/marketing/google/locations`
- `POST /api/v1/marketing/google/locations/sync`
- `POST /api/v1/marketing/google/locations/select`
- Posts, reviews, automation, usage under `/api/v1/marketing/*`

### Google Business alias (spec paths)
- `GET /api/v1/google-business/status`
- `GET /api/v1/google-business/locations`
- `POST /api/v1/google-business/posts/:id/publish`
- `GET /api/v1/google-business/reviews`
- `PUT /api/v1/google-business/automation`
- Full alias map in `src/routes/googleBusiness.routes.ts`

## OAuth Flow

1. Admin calls `GET /marketing/google/login` → Google OAuth URL
2. User grants `business.manage` scope
3. Google redirects to `GOOGLE_REDIRECT_URI`
4. Backend exchanges code, **encrypts tokens**, discovers accounts/locations
5. User selects locations via `POST /marketing/google/locations/select`

## Token Security

- `GoogleTokenService` encrypts access/refresh tokens with AES-256-GCM (`ENCRYPTION_KEY`)
- Tokens are `select: false` on `MarketingProviderAccount`
- Never returned to frontend or logged

## Google APIs Used

| API | Purpose |
|-----|---------|
| Account Management API v1 | List business accounts |
| Business Information API v1 | List locations |
| My Business API v4 | Reviews, replies, local posts |

**Note:** Google Business Profile API access may require app verification and approved OAuth scopes in production.

## Scheduling

`node-cron` jobs in `src/cron/marketing.cron.ts`:
- Review sync every 30 min (respects `autoSyncReviews` per org)
- Scheduled post publish every 15 min (atomic `processing` → `published`/`failed`)
- Token refresh every 12 hours

## Reviews & AI

- Manual reply: `PUT /reviews/:id` then `POST /reviews/:id/reply`
- AI assist: `POST /reviews/:id/generate-ai`
- Auto-reply: org-level `autoReplyEnabled` + rating rules + custom rules
- Prompt injection in review text is treated as data, not instructions

## Entitlements

Configure per organization in `Organization.settings.googleBusiness`:

```json
{
  "enabled": true,
  "features": {
    "google_business_ai": true,
    "google_business_multi_location": true
  },
  "limits": {
    "maxLocations": 5,
    "maxAiGenerationsPerMonth": 100
  }
}
```

Global kill switch: `GOOGLE_BUSINESS_FEATURE_FLAG=false`

## Environment Variables

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://api.brosavo.com/api/v1/marketing/google/callback
API_BASE_URL=https://api.brosavo.com
FRONTEND_URL=https://crm.brosavo.com
ENCRYPTION_KEY=<64 hex chars>
GOOGLE_BUSINESS_FEATURE_FLAG=true
MARKETING_UPLOAD_DIR=uploads/marketing
OPENAI_API_KEY=  # optional
```

## Google Cloud Setup

1. Create project in Google Cloud Console
2. Enable APIs:
   - Google Business Profile API
   - My Business Account Management API
   - My Business Business Information API
3. OAuth consent screen (External → Production when ready)
4. OAuth 2.0 Client (Web application)
5. Authorized redirect URI:
   - `https://api.brosavo.com/api/v1/marketing/google/callback`
6. Scope: `https://www.googleapis.com/auth/business.manage`

## Limitations

- **Performance/insights metrics**: Not fully implemented; Google Performance API requires separate integration
- **Real LLM**: Uses template AI unless `OPENAI_API_KEY` is wired (extension point in `GoogleAiService`)
- **Email notifications**: Settings exist; delivery not yet implemented
- **Cloud storage**: Local disk uploads; use object storage for production ephemeral hosts
- **Distributed cron locks**: Single-process `node-cron`; use Redis/BullMQ for multi-instance

## Permissions (RBAC)

| Permission | Capability |
|------------|------------|
| `marketing.read` | Dashboard, reviews, posts, analytics |
| `marketing.manage` | Connect Google, posts, scheduling, automation |
| `marketing.reply` | AI replies, publish review responses |

Admin role has all permissions by default.

## Tenant Isolation Tests

Run: `node --import tsx --test src/services/marketing/googleBusiness.test.ts`

Manual API tests: authenticate as Org A, attempt to access Org B resource IDs → must return 404/403.
