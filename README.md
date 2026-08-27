# 💰 Mitt budsjett

En enkel app for å budsjettere måned for måned: legg inn inntekt, sett et fast beløp per kategori (mat, bolig, transport …), og registrer utgifter som automatisk trekkes fra riktig kategori.

## Hva den gjør

- **Månedsvis budsjett** – appen åpner alltid på inneværende måned, og hopper videre av seg selv når en ny måned begynner. Bla mellom måneder med pilene øverst; hver måned har sin egen inntekt, sine budsjettbeløp og sine utgifter.
- **Inntekt** – legg inn én eller flere inntektslinjer (lønn, stipend, annet).
- **Kategorier med fast beløp** – skriv f.eks. 4000 kr på «Mat og dagligvarer» for måneden.
- **Utgifter** – beløp, kategori, beskrivelse og dato. Utgiften havner i måneden datoen tilhører.
- **Oversikt** – fargede søyler viser hvor mye av hver kategori som er brukt (grønn → gul over 80 % → rød når du er over).
- **Mål og sparing i egen boks** – mål teller motsatt vei av utgifter: søyla er rød til du passerer beløpet, grønn når målet er nådd. Sparing ligger der fra start, og du kan legge til egne mål som «Ferie til Spania». 🎯-knappen flytter en post mellom utgifter og mål.
- **Kontoer** – legg inn saldoen kontoen har. Inntekter legges til og utgifter trekkes fra automatisk, på tvers av måneder.
- **Tre faner** – *Måned* er den daglige føringen, *Innsikt* viser diagrammer og konkrete råd, *Sparing* viser sparetabellen og hvordan det har utviklet seg.
- **Hva du kan gjøre bedre** – appen leser sine egne tall og sier fra: kategorier over budsjett, forbruk som ligger an til å sprekke før måneden er omme, poster som har økt tre måneder på rad, forbruk uten budsjett, og sparerate mot 10–20 %-regelen. Positive funn kommer også med.
- **Import fra nettbanken** – slipp en CSV fra Nordea, DNB eller Revolut inn i appen. Utgiftene kategoriseres automatisk etter butikknavn, transaksjoner du alt har importert hoppes over, og kategorien du velger manuelt huskes til neste gang.
- **Kopier forrige måned** – gjenbruk budsjettbeløpene fra måneden før med ett klikk.
- **Eksport / import** – ta sikkerhetskopi av dataene som JSON.

## Slik bruker du den

Enten:

1. Åpne den publiserte versjonen: https://aj01114.github.io/mitt-budsjett-app/ *(krever at GitHub Pages er slått på – se under)*

Eller lokalt:

```bash
git clone https://github.com/AJ01114/mitt-budsjett-app.git
cd mitt-budsjett-app
```

og åpne `index.html` i nettleseren. Ingen installering, ingen byggesteg.

### Slå på GitHub Pages

Settings → Pages → Source: **Deploy from a branch** → Branch: `main` / `(root)` → Save.
Etter et minutt ligger appen på `https://aj01114.github.io/mitt-budsjett-app/`.

## Om lagringen

Alt lagres i nettleserens `localStorage` på maskinen du bruker – ingenting sendes til noen server. Det betyr også at dataene ikke følger med til en annen maskin eller nettleser automatisk; bruk **Eksporter**/**Importer** for det.

## Filer

| Fil | Innhold |
| --- | --- |
| `index.html` | Struktur og skjemaer |
| `style.css` | Utseende, lys/mørkt tema følger systemet |
| `app.js` | Lagring, faner og all rendering |
| `bank-import.js` | Leser CSV fra nettbanken og gjetter format, dato, beløp og kategori |
| `insights.js` | Månedssummer, sparetabell, tempoberegning og rådene |
| `charts.js` | Diagrammene, tegnet som SVG uten bibliotek |

## Om diagrammene

Fargene er valgt etter hva de gjør, ikke etter smak: blå bærer størrelse og «inn», oransje er den andre serien, og rødt er reservert for tilstand – og følges alltid av et ord, aldri farge alene. Palettene er kjørt gjennom en kontrast- og fargeblindhetstest mot appens egne flater i både lys og mørk modus. Hvert diagram har en tabell eller direkte tallmerking ved siden av, så ingenting krever at du kan skille fargene.

## Om bankimport

Appen kobler seg **ikke** til banken din. Ekte kontokobling krever PSD2-tilgang gjennom en lisensiert aktør, og den gratis veien for hobbyprosjekter (Nordigen/GoCardless) er stengt for nye brukere. Derfor går veien om kontoutskriften:

1. Last ned transaksjonene som CSV – Nordea: *Kontoutskrift → Last ned*, Revolut: *Statement → Excel/CSV*.
2. Velg hvilken konto utskriften gjelder, og slipp fila i importfeltet.
3. Se over forslagene, juster kategoriene du vil endre, og legg dem inn.

Formatet gjettes automatisk: semikolon eller komma, norsk (`1 234,56`) eller engelsk (`1,234.56`) tallformat, ett beløpsfelt med fortegn eller egne kolonner for inn og ut.
