# Tech Context

## Environment & Database
- Host Neon: `ep-summer-field-anzq3bjq-pooler.c-6.us-east-1.aws.neon.tech`
- DB: `neondb` | User: `neondb_owner` | SSL: `require` + `channel_binding=require`
- `DATABASE_URL` definida en `.env` (raíz del proyecto)
- Backend en producción: `https://erp-principal-m-s.vercel.app`
- Frontend en producción: `https://salazaroliveros-prog.github.io/ERP-PRINCIPAL-M-S`
- Auth: Google OAuth (`GOOGLE_CLIENT_ID` configurado)
- AI: Gemini (`VITE_GEMINI_API_KEY` + `AI_PROVIDER=gemini`)

## Confirmed Stack
| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + TypeScript |
| Backend | Express (Node.js) + TypeScript |
| Database | PostgreSQL (Neon) |
| Deployment | Vercel (backend) + GitHub Pages (frontend) |
| API Style | REST — requestJson centralizado (offline queue, retry, cache) |

## Key Files
| File | Purpose |
|------|---------|
| `sql/029_create_tasks.sql` | Migración: tabla tasks con FK a projects |
| `src/lib/tasksApi.ts` | Cliente CRUD para /api/tasks |
| `src/components/Tasks.tsx` | UI completa (filtros, modal, estados, prioridades) |
| `server.ts` | Rutas GET/POST/PATCH/DELETE /api/tasks + fallback offline |
| `src/App.tsx` | Ruta /tasks registrada |
| `src/components/Sidebar.tsx` | NavItem Tasks en grupo Operaciones |

## Tooling Infrastructure
| Tool | Purpose |
|------|---------|
| Amazon Q Developer | IDE assistant + rules engine + memory bank |
| Continue.dev | MCP server integration (`.continue/mcpServers/`) |
| Google Gemini | AI planning support (`.gemini/settings.json`) |
| GitHub Agents | Multi-agent workflow (Planner → Implementer → Reviewer) |

## Conventions
- `requestJson` centralizado para todas las llamadas API (manejo offline/retry)
- TypeScript estricto en todo el proyecto
- Migraciones SQL numeradas secuencialmente (029_...)
