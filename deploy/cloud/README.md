# Nasadenie cloudu (ozvi.io)

Jedna VM s Dockerom, na nej tri compose projekty:

| Projekt | Čo | Kde |
|---|---|---|
| `ozvi-edge` | Caddy: HTTPS, basic auth stagingu, certifikáty na požiadanie | `deploy/cloud/edge` |
| `ozvi-staging` | Postgres + Ozvi + nočná záloha, `staging.ozvi.io` za basic auth | `/srv/ozvi-env/staging/.env` |
| `ozvi-live` | to isté pre `ozvi.io`, `*.ozvi.io` a vlastné domény zákazníkov | `/srv/ozvi-env/live/.env` |

Prostredia majú vlastnú databázu, prílohy, kľúče a zálohy. Spája ich iba sieť `ozvi-edge`, v ktorej má Ozvi meno `staging-ozvi` alebo `live-ozvi`.

## Prvé spustenie

```sh
git clone https://github.com/xzamiska/ozvi /srv/ozvi
cd /srv/ozvi/deploy/cloud/edge && cp .env.example .env   # doplňte meno a hash pre basic auth
ln -s ../sites/staging.caddy sites-enabled/              # live.caddy až keď DNS ozvi.io ukazuje sem
docker compose up -d
mkdir -p /srv/ozvi-env/staging && cp ../app/.env.example /srv/ozvi-env/staging/.env   # doplňte kľúče
/srv/ozvi/deploy/cloud/ozvi-env.sh staging up -d
```

DNS (bez proxy Cloudflare, certifikáty vydáva Caddy):

| Záznam | Typ | Hodnota |
|---|---|---|
| `staging.ozvi.io`, `*.staging.ozvi.io` | A | IP VM |
| `ozvi.io`, `*.ozvi.io`, `domains.ozvi.io` | A | IP VM (live) |

## Certifikáty

- Prostredie sa na edge zapína odkazom v `sites-enabled/` (`staging.caddy`, `live.caddy`). Bez DNS by Caddy iba zbieral neúspešné pokusy o certifikát a narazil na limity Let's Encrypt.

- `ozvi.io` a `staging.ozvi.io` dostanú certifikát hneď.
- `<projekt>.ozvi.io`, `<projekt>.staging.ozvi.io` a vlastné domény zákazníkov ho dostanú pri prvej návšteve. Caddy sa najprv spýta toho prostredia, ktorému meno patrí (`/api/domains/ask`), a to súhlasí iba so svojimi projektmi a overenými doménami.
- Vlastné domény zákazníkov má iba live.

## Staging za basic auth

Heslo vyžadujú iba stránky, ktoré otvára človek. Otvorené ostávajú:
- API a webhooky (Creem, GitHub, Linear, Jira), lebo majú vlastné overenie,
- MCP, OAuth a `.well-known`,
- widget, písma a `releases.json`.

Inak by na staging nedosiahli aplikácie, agenti ani platobná brána.

## Aktualizácia a zálohy

```sh
/srv/ozvi/deploy/cloud/ozvi-env.sh staging pull ozvi && /srv/ozvi/deploy/cloud/ozvi-env.sh staging up -d
```

Najprv staging, overiť, potom live. Migrácie prebehnú pri štarte. Každú noc o 02:30 urobí `pg_dump` do `/srv/ozvi-env/<env>/backups` (14 dní), navyše sa zálohuje celá VM.
