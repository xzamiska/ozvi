# 0005 — Prihlásenie primárne cez hostiteľskú appku

**Stav:** prijaté 2026-11-05

**Rozhodnutie.** Poradie podpory:
1. **Podpísaný token** (HS256 JWT, `@ozvi/sdk` `signOzviToken`, s traits plan/MRR) — najjednoduchšia integrácia, žiadny redirect.
2. **OIDC** s tichým `prompt=none` (Apinido už je OIDC provider cez BetterAuth), viac providerov na projekt.
3. **Trusted header** (forward auth) pre self-host za proxy.
4. **Ozvi účet** v cloude: 6-miestny kód + magic link v jednom e-maile, rozpísaný draft sa zachová; passkeys, Google/GitHub.

**Prečo.** Používateľ nemá zakladať ďalší účet; dnešný `FIDER_SSO_URL` hack funguje len pre jeden tier.
