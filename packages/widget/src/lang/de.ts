import { registerPack } from "../lang-pack";

registerPack({
  lang: "de",
  main: {
    fb: "Feedback", fbFor: "Feedback für ", app: "die App", shooting: "Screenshot wird erstellt …",
    bug: "Fehler melden", bugSub: "Wir hängen Screenshot und technische Details an", idea: "Idee vorschlagen", ideaSub: "Oder für eine bestehende abstimmen",
    mine: "Meine Meldungen", mineSub: "Status und Antworten des Teams", thanks: "Vielen Dank", close: "Schließen",
    what: "Was funktioniert nicht?", whatPh: "Z. B. Die USt-IdNr. verschwindet nach dem Speichern", how: "Was haben Sie getan und was erwartet?", opt: "(optional)",
    howPh: "Z. B. Ich habe die USt-IdNr. eingetragen, nach dem Speichern war sie weg", shotAlt: "Screenshot, der angehängt wird", shotDel: "Screenshot entfernen",
    del: "Entfernen: ", attach: "Datei anhängen", sending: "Wird gesendet …",
    note: "Wir hängen Seitenadresse, App-Version, Browser und aktuelle Konsolenfehler an. Nur Sie und das Team sehen die Meldung.", ann: "Markieren", annFail: "Der Editor konnte nicht geladen werden.",
    tech: "Anfrageprotokoll und letzte Schritte anhängen", techSub: "Ohne Feldinhalte; sensible Daten werden maskiert. Nur das Team sieht es.",
    tag: "Fehlermeldung", route: "Ablauf der Meldung", stops: ["Eingegangen", "Bestätigt", "In Arbeit", "Behoben"],
    sent: "Ihre Meldung ist eingegangen. Nur Sie und das Team sehen sie. Bei jedem Schritt erhalten Sie eine E-Mail, und nach der Korrektur bestätigen Sie mit einem Klick, ob es funktioniert.",
    view: "Meldung ansehen", files: "Einige Dateien wurden nicht hinzugefügt: max. 10 MB, nur Bilder, PDF oder Text.",
    queued: "Wartet auf Freigabe", queuedText: "Das Team gibt Beiträge von außerhalb des Teams vor der Veröffentlichung frei. Bis dahin sehen nur Sie ihn; nach der Freigabe alle. Veröffentlicht das Team ihn nicht, teilen wir Ihnen per E-Mail den Grund mit.",
    fail: "Die Meldung konnte nicht gesendet werden.", who: "Wir konnten Sie nicht verifizieren. Laden Sie die Seite neu und versuchen Sie es erneut.",
    ideas: "Ideen", loading: "Wird geladen …", loadFail: "Laden fehlgeschlagen. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.", back: "Zurück",
  },
  ideas: {
    search: "Ideen durchsuchen", searchPh: "Z. B. CSV-Export", none: "Nichts gefunden. Schlagen Sie es als neue Idee vor.", empty: "Noch keine Ideen.",
    suggest: "Neue Idee vorschlagen", all: "Alle Ideen auf dem Board", vote: "Abstimmen", voted: "Abgestimmt", votes: (n: number) => `${n} ${n === 1 ? "Stimme" : "Stimmen"}`,
    weight: (w: number) => `Wichtigkeit ${w} von 3`, left: (l: number, t: number) => `${l} von ${t} Punkten übrig`,
    title: "Titel der Idee", titlePh: "Z. B. Wiederkehrende Rechnungen", body: "Was würde es erleichtern?", opt: "(optional)",
    similar: "Ähnliche Ideen", similarSub: "Ist Ihre dabei, stimmen Sie dafür ab. So sieht das Team deutlicher, was Sie sich wünschen.",
    send: "Idee vorschlagen", sending: "Wird gesendet …", tag: "Idee", queued: "Wartet auf Freigabe",
    queuedText: "Das Team gibt Beiträge von außerhalb des Teams vor der Veröffentlichung frei. Bis dahin sehen nur Sie ihn; nach der Freigabe alle. Veröffentlicht das Team ihn nicht, teilen wir Ihnen per E-Mail den Grund mit.",
    sent: "Ihre Idee ist auf dem Board. Andere können dafür abstimmen, und Sie erhalten eine E-Mail, wenn sich ihr Status ändert.", view: "Idee ansehen", back: "Zurück zu den Ideen",
    fail: "Das hat nicht geklappt. Bitte versuchen Sie es erneut.", who: "Wir konnten Sie nicht verifizieren. Laden Sie die Seite neu und versuchen Sie es erneut.", status: "Status",
  },
  annotate: {
    title: "Markieren Sie, was nicht funktioniert", hint: "Zum Zeichnen ziehen. Die Unschärfe wird vor dem Senden fest ins Bild eingerechnet.",
    tools: "Werkzeuge", box: "Rahmen", arrow: "Pfeil", mark: "Hervorheben", blur: "Unschärfe", undo: "Rückgängig", skip: "Unverändert verwenden", done: "Übernehmen",
    canvas: "Screenshot. Enter fügt in der Mitte eine Form hinzu, Pfeiltasten verschieben sie, Umschalt und Pfeiltasten ändern ihre Größe, Entf entfernt sie.",
    added: "Hinzugefügt: ", moved: "Verschoben", removed: "Entfernt", undone: "Rückgängig gemacht", none: "Nichts rückgängig zu machen",
  },
  embeds: {
    roadmap: "Roadmap", whole: "Gesamte Roadmap", nothing: "Noch nichts", votes: (n: number) => `${n} ${n === 1 ? "Stimme" : "Stimmen"}`,
    news: "Neuigkeiten", all: "Alle Neuigkeiten", fresh: "Neu", freshN: (n: number) => `${n} neu`,
    none: "Noch keine Neuigkeiten.", more: "Weiterlesen", fail: "Laden fehlgeschlagen. Bitte laden Sie die Seite neu.", related: "Zugehörige Ideen",
    loading: "Wird geladen…",
  },
});
