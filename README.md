# E-commerce Support Tool (GPT-powered)

Monorepo with React client and Node server using Supabase.

## Quickstart

1) Create a Supabase project and run `docs/SUPABASE_SCHEMA.sql`.

2) Copy `.env.example` to `.env` (both root and server) and fill values.

3) Install deps:
```
cd client && npm i && cd ../server && npm i
```

4) Run:
```
cd server && npm run dev
cd client && npm run dev
```

Client at http://localhost:5173, Server at http://localhost:8080

## Notes
- Chat calls server `/api/chat` which uses Supabase and GitHub Models.
- Admin page lists escalated conversations from `/api/admin/escalations`.

