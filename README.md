# PDF Link

Upload PDF’s na e-mailverificatie en deel publieke links (`/p/:id`, `/d/:id`).

- **Lokaal:** `cp .env.example .env` → vul secrets in → `docker compose up --build`
- **Productie (Coolify):** [docs/COOLIFY.md](docs/COOLIFY.md) — domein `https://pdf.bjorn-sites.nl`

## Stack

Node 20, Express, Resend (magic link), Docker.
