import { registerPack } from "../lang-pack";

/** Polish plural: 1 → one, 2–4 (not 12–14) → few, otherwise many. */
const pl = (n: number, one: string, few: string, many: string) =>
  n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many;

registerPack({
  lang: "pl",
  main: {
    fb: "Opinie", fbFor: "Opinie: ", app: "aplikacja", shooting: "Robię zrzut ekranu…",
    bug: "Zgłoś błąd", bugSub: "Dołączymy zrzut ekranu i szczegóły techniczne", idea: "Zaproponuj pomysł", ideaSub: "Albo zagłosuj na istniejący",
    mine: "Moje zgłoszenia", mineSub: "Status i odpowiedzi zespołu", thanks: "Dziękujemy", close: "Zamknij",
    what: "Co nie działa?", whatPh: "Np. Notatka znika po zapisaniu", how: "Co robisz i co powinno się stać?", opt: "(opcjonalnie)",
    howPh: "Np. wpisuję notatkę, a po zapisaniu pole jest puste", shotAlt: "Zrzut ekranu, który zostanie dołączony", shotDel: "Usuń zrzut ekranu",
    del: "Usuń: ", attach: "Dołącz plik", sending: "Wysyłanie…",
    note: "Dołączymy adres strony, wersję aplikacji, przeglądarkę i ostatnie błędy z konsoli. Zgłoszenie widzisz tylko ty i zespół.", ann: "Zaznacz", annFail: "Nie udało się wczytać edytora.",
    tech: "Dołącz dziennik żądań i ostatnie kroki", techSub: "Bez zawartości pól; wrażliwe dane są maskowane. Widzi to tylko zespół.",
    tag: "Zgłoszenie błędu", route: "Ścieżka zgłoszenia", stops: ["Przyjęte", "Potwierdzone", "W realizacji", "Naprawione"],
    sent: "Mamy twoje zgłoszenie. Widzisz je tylko ty i zespół. Na każdym etapie dostaniesz e-mail, a po poprawce jednym kliknięciem potwierdzisz, czy działa.",
    view: "Zobacz zgłoszenie", files: "Niektórych plików nie dodano: maks. 10 MB, tylko obrazy, PDF lub tekst.",
    queued: "Czeka na zatwierdzenie", queuedText: "Zespół zatwierdza wpisy od osób spoza zespołu przed publikacją. Na razie widzisz go tylko ty; po zatwierdzeniu zobaczą go wszyscy. Jeśli zespół go nie opublikuje, napiszemy ci dlaczego.",
    fail: "Nie udało się wysłać zgłoszenia.", who: "Nie udało się potwierdzić twojej tożsamości. Odśwież stronę i spróbuj ponownie.",
    ideas: "Pomysły", loading: "Wczytywanie…", loadFail: "Nie udało się wczytać. Sprawdź połączenie i spróbuj ponownie.", back: "Wstecz",
  },
  ideas: {
    search: "Szukaj pomysłów", searchPh: "Np. eksport do CSV", none: "Nic nie znaleźliśmy. Zaproponuj to jako nowy pomysł.", empty: "Nie ma jeszcze pomysłów.",
    suggest: "Zaproponuj nowy pomysł", all: "Wszystkie pomysły na tablicy", vote: "Zagłosuj", voted: "Zagłosowano",
    votes: (n: number) => `${n} ${pl(n, "głos", "głosy", "głosów")}`,
    weight: (w: number) => `Ważność ${w} z 3`,
    left: (l: number, t: number) => `Zostało ${l} z ${t} ${t === 1 ? "punktu" : "punktów"}`,
    title: "Tytuł pomysłu", titlePh: "Np. Eksport do CSV", body: "Co by ci to ułatwiło?", opt: "(opcjonalnie)",
    similar: "Podobne pomysły", similarSub: "Jeśli jest wśród nich twój, zagłosuj na niego. Zespół lepiej zobaczy, czego chcesz.",
    send: "Zaproponuj pomysł", sending: "Wysyłanie…", tag: "Pomysł", queued: "Czeka na zatwierdzenie",
    queuedText: "Zespół zatwierdza wpisy od osób spoza zespołu przed publikacją. Na razie widzisz go tylko ty; po zatwierdzeniu zobaczą go wszyscy. Jeśli zespół go nie opublikuje, napiszemy ci dlaczego.",
    sent: "Twój pomysł jest na tablicy. Inni mogą na niego głosować, a gdy zmieni się jego status, dostaniesz e-mail.", view: "Zobacz pomysł", back: "Wróć do pomysłów",
    fail: "Nie udało się. Spróbuj ponownie.", who: "Nie udało się potwierdzić twojej tożsamości. Odśwież stronę i spróbuj ponownie.", status: "Status",
  },
  annotate: {
    title: "Zaznacz, co nie działa", hint: "Przeciągnij, aby rysować. Rozmycie zostaje trwale naniesione na obraz przed wysłaniem.",
    tools: "Narzędzia", box: "Ramka", arrow: "Strzałka", mark: "Wyróżnij", blur: "Rozmyj", undo: "Cofnij", skip: "Bez zmian", done: "Zastosuj",
    canvas: "Zrzut ekranu. Enter dodaje kształt na środku, strzałki go przesuwają, Shift ze strzałkami zmienia rozmiar, Delete go usuwa.",
    added: "Dodano: ", moved: "Przesunięto", removed: "Usunięto", undone: "Cofnięto", none: "Nie ma czego cofnąć",
  },
  embeds: {
    roadmap: "Roadmapa", whole: "Cała roadmapa", nothing: "Na razie nic", votes: (n: number) => `${n} ${pl(n, "głos", "głosy", "głosów")}`,
    news: "Nowości", all: "Wszystkie nowości", fresh: "Nowe", freshN: (n: number) => `${n} ${pl(n, "nowa", "nowe", "nowych")}`,
    none: "Na razie brak nowości.", more: "Czytaj dalej", fail: "Nie udało się wczytać. Spróbuj odświeżyć stronę.", related: "Powiązane pomysły",
    loading: "Wczytywanie…",
  },
});
