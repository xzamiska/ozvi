import { registerPack } from "../lang-pack";

registerPack({
  lang: "hu",
  main: {
    fb: "Visszajelzés", fbFor: "Visszajelzés: ", app: "alkalmazás", shooting: "Képernyőkép készítése…",
    bug: "Hiba bejelentése", bugSub: "Csatolunk egy képernyőképet és technikai adatokat", idea: "Ötlet beküldése", ideaSub: "Vagy szavazz egy meglévőre",
    mine: "Bejelentéseim", mineSub: "Állapot és a csapat válaszai", thanks: "Köszönjük", close: "Bezárás",
    what: "Mi nem működik?", whatPh: "Pl. Mentés után eltűnik a megjegyzés", how: "Mit csináltál, és mire számítottál?", opt: "(nem kötelező)",
    howPh: "Pl. Kitöltöttem a megjegyzést, és mentés után eltűnt", shotAlt: "A csatolandó képernyőkép", shotDel: "Képernyőkép eltávolítása",
    del: "Eltávolítás: ", attach: "Fájl csatolása", sending: "Küldés…",
    note: "Csatoljuk az oldal címét, az alkalmazás verzióját, a böngészőt és a legutóbbi konzolhibákat. A bejelentést csak te és a csapat látjátok.", ann: "Megjelölés", annFail: "Nem sikerült betölteni a szerkesztőt.",
    tech: "A kérésnapló és az utolsó lépések csatolása", techSub: "A mezők tartalma nélkül, az érzékeny adatokat elrejtjük. Csak a csapat látja.",
    tag: "Hibajelentés", route: "A bejelentés útja", stops: ["Beérkezett", "Megerősítve", "Folyamatban", "Javítva"],
    sent: "Megkaptuk a bejelentésed. Csak te és a csapat látjátok. Minden állomásnál e-mailt kapsz, a javítás után pedig egy kattintással jelezheted, hogy működik-e.",
    view: "Bejelentés megtekintése", files: "Néhány fájlt nem adtunk hozzá: legfeljebb 10 MB, csak kép, PDF vagy szöveg.",
    queued: "Jóváhagyásra vár", queuedText: "A csapat közzététel előtt jóváhagyja a csapaton kívüliek bejegyzéseit. Egyelőre csak te látod; jóváhagyás után mindenki. Ha a csapat nem teszi közzé, e-mailben megírjuk, miért.",
    fail: "Nem sikerült elküldeni a bejelentést.", who: "Nem sikerült ellenőrizni, ki vagy. Töltsd újra az oldalt, és próbáld újra.",
    ideas: "Ötletek", loading: "Betöltés…", loadFail: "Nem sikerült betölteni. Ellenőrizd a kapcsolatot, és próbáld újra.", back: "Vissza",
  },
  ideas: {
    search: "Ötletek keresése", searchPh: "Pl. CSV-export", none: "Nincs találat. Küldd be új ötletként.", empty: "Még nincsenek ötletek.",
    suggest: "Új ötlet beküldése", all: "Az összes ötlet a táblán", vote: "Szavazok", voted: "Szavaztál", votes: (n: number) => `${n} szavazat`,
    weight: (w: number) => `Fontosság: ${w}/3`, left: (l: number, t: number) => `Maradt: ${l}/${t} pont`,
    title: "Az ötlet címe", titlePh: "Pl. Exportálás CSV-be", body: "Mit tenne könnyebbé?", opt: "(nem kötelező)",
    similar: "Hasonló ötletek", similarSub: "Ha a tiéd köztük van, szavazz rá. Így a csapat jobban látja, mit szeretnél.",
    send: "Ötlet beküldése", sending: "Küldés…", tag: "Ötlet", queued: "Jóváhagyásra vár",
    queuedText: "A csapat közzététel előtt jóváhagyja a csapaton kívüliek bejegyzéseit. Egyelőre csak te látod; jóváhagyás után mindenki. Ha a csapat nem teszi közzé, e-mailben megírjuk, miért.",
    sent: "Az ötleted felkerült a táblára. Mások szavazhatnak rá, és e-mailt kapsz, ha megváltozik az állapota.", view: "Ötlet megtekintése", back: "Vissza az ötletekhez",
    fail: "Nem sikerült. Próbáld újra.", who: "Nem sikerült ellenőrizni, ki vagy. Töltsd újra az oldalt, és próbáld újra.", status: "Állapot",
  },
  annotate: {
    title: "Jelöld meg, mi nem működik", hint: "Rajzolj húzással. Az elmosás küldés előtt véglegesen beégül a képbe.",
    tools: "Eszközök", box: "Keret", arrow: "Nyíl", mark: "Kiemelés", blur: "Elmosás", undo: "Visszavonás", skip: "Módosítás nélkül", done: "Alkalmaz",
    canvas: "Képernyőkép. Az Enter alakzatot tesz a közepére, a nyilak mozgatják, a Shift és a nyilak átméretezik, a Delete törli.",
    added: "Hozzáadva: ", moved: "Áthelyezve", removed: "Eltávolítva", undone: "Visszavonva", none: "Nincs mit visszavonni",
  },
  embeds: {
    roadmap: "Ütemterv", whole: "A teljes ütemterv", nothing: "Még nincs semmi", votes: (n: number) => `${n} szavazat`,
    news: "Újdonságok", all: "Az összes újdonság", fresh: "Új", freshN: (n: number) => `${n} új`,
    none: "Még nincsenek újdonságok.", more: "Tovább", fail: "Nem sikerült betölteni. Próbáld újratölteni az oldalt.", related: "Kapcsolódó ötletek",
    loading: "Betöltés…",
  },
});
