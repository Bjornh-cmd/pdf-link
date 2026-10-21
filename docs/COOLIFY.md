# PDF Link deployen op Coolify (pdf.bjorn-sites.nl)

Deze app draait als Docker-container (Node 20). Coolify bouwt de image uit de [Dockerfile](../Dockerfile) en routeert HTTPS naar poort **3000**.

## Overzicht

| Item | Waarde |
|------|--------|
| Publieke URL | `https://pdf.bjorn-sites.nl` |
| Containerpoort | `3000` |
| Health check | `GET /health` → `{"ok":true}` |
| PDF-opslag | `/data/uploads` (volume) |
| Tokens / passkeys | `/data/uploads/.app` (in upload-volume) |

## 1. DNS

Bij je DNS-provider (waar `bjorn-sites.nl` staat):

| Type | Naam | Waarde |
|------|------|--------|
| `A` | `pdf` | IP-adres van je Coolify-server |

Of `CNAME` naar het hostname dat Coolify geeft, als je dat gebruikt.

Wacht tot `pdf.bjorn-sites.nl` naar de server wijst (meestal enkele minuten tot uren).

## 2. Nieuw project in Coolify

1. Log in op je Coolify-dashboard.
2. **+ Add** → **New Resource** → **Application** (of **Public Repository**).
3. Koppel **GitHub** en selecteer repo: `Bjornh-cmd/pdf-link` (branch `main`).
4. **Build Pack**: **Dockerfile** (pad: `/Dockerfile` in de root).
5. **Port**: `3000` (niet 80).

## 3. Domein en SSL

1. Tab **Configuration** → **Domains** (of **FQDN**).
2. Voeg toe: `https://pdf.bjorn-sites.nl`
3. Zet **HTTPS / Let's Encrypt** aan.
4. Deploy opnieuw als Coolify dat vraagt na DNS-wijziging.

De reverse proxy van Coolify zet `X-Forwarded-Proto`; de app heeft `trust proxy` aan zodat sessies en cookies correct werken.

## 4. Omgevingsvariabelen

In Coolify: **Environment Variables** (productie). Geen secrets in git.

| Variabele | Waarde (productie) | Verplicht |
|-----------|-------------------|-----------|
| `NODE_ENV` | `production` | Ja |
| `PORT` | `3000` | Ja (meestal default in image) |
| `BASE_URL` | `https://pdf.bjorn-sites.nl` | **Ja** — magic links in e-mail |
| `SESSION_SECRET` | lange random string (32+ tekens) | **Ja** |
| `RESEND_API_KEY` | key uit [Resend](https://resend.com/api-keys) | **Ja** |
| `EMAIL_FROM` | `pdf@support.snubstad.nl` | Ja (domein verified in Resend) |
| `ALLOWED_UPLOAD_EMAIL` | `bjornhoutman14@gmail.com` | Ja |
| `UPLOAD_DIR` | `/data/uploads` | Ja |
| `DATA_DIR` | `/data/uploads/.app` | Ja (passkeys + tokens; zit in upload-volume) |
| `MAX_FILE_SIZE_MB` | `25` | Nee |
| `COOKIE_SECURE` | `true` | Optioneel (auto bij `https://` in `BASE_URL`) |
| `RP_ID` | `pdf.bjorn-sites.nl` | Passkey (default = hostname uit `BASE_URL`) |
| `RP_NAME` | `PDF Link` | Passkey-weergavenaam |

**Belangrijk:** `BASE_URL` moet exact `https://pdf.bjorn-sites.nl` zijn (geen trailing slash). Anders kloppen inloglinks in de mail niet.

**Passkey:** `RP_ID` is optioneel — standaard gebruikt de server het domein uit je browser (`Host` / `X-Forwarded-Host`). Zet `BASE_URL` op hetzelfde domein. Open de site niet via `localhost` als je op productie deployt. Lokaal: gebruik `http://localhost:3000`, niet `127.0.0.1`.

## 5. Persistent storage (volumes)

Zonder volumes verdwijnen PDF’s en inlogtokens bij elke redeploy.

In Coolify → **Storages** / **Persistent Storage** (namen kunnen per versie verschillen):

| Mount path in container | Doel |
|-------------------------|------|
| `/data/uploads` | PDF’s + map `.app` (passkeys, e-mailtokens) |

Eén **persistent volume** op `/data/uploads` is genoeg. Zet `DATA_DIR=/data/uploads/.app`.

Bij upgrade van een oude setup met apart volume `/data/app`: de app migreert `credentials.json` automatisch naar `/data/uploads/.app` bij start.

**Verwijder** in Coolify de oude env `DATA_DIR=/data/app` als die nog staat. Gebruik alleen `/data/uploads/.app` (of laat `DATA_DIR` weg — de app kiest dan automatisch `/data/uploads/.app`).

### Redeploy: PDF’s en passkey behouden

1. **Persistent storage** op `/data/uploads` (niet alleen “ephemeral” container storage).
2. **Geen** `DATA_DIR=/data/app` in environment.
3. Na redeploy: open `https://pdf.bjorn-sites.nl/health` — verwacht:
   ```json
   { "ok": true, "storage": { "ready": true, "pdfCount": 1, "passkeyCount": 1 } }
   ```
   (`pdfCount` / `passkeyCount` ≥ wat je had vóór de deploy.)
4. Tab **PDF’s** en **Passkey** in de app controleren.

Een nieuwe deploy vervangt alleen de **container image**; het **volume** blijft op de server staan.

## 6. Health check (optioneel in UI)

Als Coolify een custom health check toont:

- **Path:** `/health`
- **Port:** `3000`
- **Method:** GET
- **Expected:** HTTP 200, body bevat `"ok":true`

De Dockerfile/compose healthcheck gebruikt hetzelfde pad.

## 7. Resend (e-mail inlog)

1. [Resend → Domains](https://resend.com/domains): verifieer **`support.snubstad.nl`** (voor `pdf@support.snubstad.nl`).
2. DNS-records van Resend toevoegen bij je DNS-host.
3. Status **Verified** afwachten.
4. Test: op `https://pdf.bjorn-sites.nl` → **Stuur inloglink** → mail op `ALLOWED_UPLOAD_EMAIL`.

Het **app-domein** (`pdf.bjorn-sites.nl`) is niet hetzelfde als het **mail-domein** (`support.snubstad.nl`); alleen het mail-domein moet in Resend staan.

## 8. Deploy

1. **Deploy** / **Redeploy**.
2. Logs: geen `RESEND_API_KEY ontbreekt`.
3. Browser: `https://pdf.bjorn-sites.nl` → inloggen → PDF uploaden → deelbare `/p/...` link in nieuwe tab (zonder login).

## 9. Lokale referentie (docker compose)

Zie [docker-compose.yml](../docker-compose.yml) en [.env.example](../.env.example). Voor Coolify hoef je geen `docker-compose` op de server te draaien; Coolify bouwt alleen de Dockerfile.

Optioneel bestand [docker-compose.coolify.yml](../docker-compose.coolify.yml) is een referentie voor volume-paden en env-namen.

## 10. Problemen oplossen

| Symptoom | Oplossing |
|----------|-----------|
| “E-mail is niet geconfigureerd” | `RESEND_API_KEY` in Coolify env; container redeploy |
| Mail komt niet aan | Resend-domain verified? Logs: `Resend API error` |
| Inloglink opent localhost | `BASE_URL` → `https://pdf.bjorn-sites.nl` |
| Inlog werkt niet na klik | `BASE_URL` moet HTTPS zijn; cookies: `COOKIE_SECURE=true` als nodig |
| PDF’s of passkey weg na deploy | Persistent volume op `/data/uploads` + `DATA_DIR=/data/uploads/.app` |
| 502 Bad Gateway | App draait? Poort **3000** in Coolify? Logs van container |

## 11. Checklist productie

- [ ] DNS `pdf` → Coolify-server
- [ ] SSL actief op `pdf.bjorn-sites.nl`
- [ ] `BASE_URL=https://pdf.bjorn-sites.nl`
- [ ] `SESSION_SECRET` uniek en sterk
- [ ] `RESEND_API_KEY` gezet
- [ ] Resend-domein `support.snubstad.nl` verified
- [ ] Volume `/data/uploads` (persistent)
- [ ] Health `/health` groen
- [ ] Test: e-mail inlog + upload + publieke PDF-link
