# Vydanie novej verzie

Verzie sú semver: `1.4.2` = oprava, `1.5.0` = nové funkcie, `2.0.0` = zmena, ktorá vyžaduje zásah správcu. Vydanie spustí tag `vX.Y.Z` a o zvyšok sa postará [`.github/workflows/release.yml`](../.github/workflows/release.yml).

## Postup

1. `main` je zelený (workflow CI) a cloud aj staging bežia bez problémov.
2. Napíšte poznámky do `apps/web/releases/X.Y.Z.md`, formát je v [releases/README](../apps/web/releases/README.md). Pri zásadnej zmene nastavte `breaking: true`.
3. Commitnite poznámky do `main` a otagujte:
   ```sh
   git tag -a v1.5.0 -m "Ozvi 1.5.0" && git push origin v1.5.0
   ```
4. Workflow:
   - zostaví `ghcr.io/xzamiska/ozvi` a `ghcr.io/xzamiska/ozvi-updater` pre `amd64` a `arm64`,
   - nahrá značky `1.5.0`, `1.5`, `1` a `latest`,
   - vytvorí GitHub Release s poznámkami.

   Bez súboru s poznámkami workflow skončí chybou a nič sa nenahrá.
5. Nasaďte cloud (ozvi.io) na novú verziu. Až potom sa vydanie objaví na `ozvi.io/releases` a v `releases.json`. Odtiaľ si ho nájdu vlastné servery a updatery: v noci ho nainštalujú tie v automatickom režime, ostatným príde e-mail.

Pred-vydanie `v1.5.0-rc.1` dostane len vlastnú značku. Nepohnú sa ním `1`, `1.5` ani `latest`, takže ho žiadny updater nenainštaluje sám a nepotrebuje poznámky.

## Obrazy

- Balíky `ozvi` a `ozvi-updater` na ghcr.io sú verejné, rovnako ako repozitár. Sťahujú sa bez prihlásenia.
- Viditeľnosť je v GitHub → Packages → balík → Package settings. Nový balík vzniká po prvom vydaní ako súkromný, preto ho treba raz prepnúť na verejný.
- Workflow sa do registra prihlasuje vlastným `GITHUB_TOKEN`. Žiadne ďalšie tajomstvá nepotrebuje.

## Prvé vydanie

V `apps/web/releases/_draft-1.0.0.md` je pripravený návrh poznámok. Pri prvom vydaní ho premenujte na `1.0.0.md`, upravte dátum a otagujte `v1.0.0`.
