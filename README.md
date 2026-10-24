# PDF Link

Upload bestanden (PDF, STL, afbeeldingen, zip, …) na e-mailverificatie en deel publieke links (`/p/:id` bekijken waar mogelijk, `/d/:id` download).

- **Lokaal:** `cp .env.example .env` → vul secrets in → `docker compose up --build`
- **Productie (Coolify):** [docs/COOLIFY.md](docs/COOLIFY.md) — domein `https://pdf.bjorn-sites.nl`

## Stack

Node 20, Express, Resend (magic link), Docker.
