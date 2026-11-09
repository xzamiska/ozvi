# Poznámky k vydaniam Ozvi

Jeden súbor na verziu: `releases/<verzia>.md`, napr. `1.5.0.md`. Ozvi.io ich ukazuje na `/releases` a v `/releases.json` (z toho zoznamu čítajú vlastné servery a updater).

```
---
date: 2026-11-20
breaking: false
---
### Nové
- …

### Opravy
- …
```

- `breaking: true`, keď aktualizácia vyžaduje zásah správcu alebo niečo prestane fungovať. Updater takú verziu nenainštaluje automaticky. Nová hlavná verzia (2.0.0) má byť vždy `breaking: true`.
- Píšeme pre správcov a tímy zákazníkov, nie pre nás: čo sa zmenilo pre nich, nie názvy commitov.
- Workflow `release.yml` odmietne tag `vX.Y.Z` bez tohto súboru. Postup vydania: [docs/RELEASING.md](../../../docs/RELEASING.md).
- Súbory, ktoré nezačínajú číslom verzie (tento README, `_draft-…`), sa nezobrazujú.
