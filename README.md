# 💰 Mitt budsjett

En enkel app for å budsjettere måned for måned: legg inn inntekt, sett et fast beløp per kategori (mat, bolig, transport …), og registrer utgifter som automatisk trekkes fra riktig kategori.

## Hva den gjør

- **Månedsvis budsjett** – appen åpner alltid på inneværende måned, og hopper videre av seg selv når en ny måned begynner. Bla mellom måneder med pilene øverst; hver måned har sin egen inntekt, sine budsjettbeløp og sine utgifter.
- **Inntekt** – legg inn én eller flere inntektslinjer (lønn, stipend, annet).
- **Kategorier med fast beløp** – skriv f.eks. 4000 kr på «Mat og dagligvarer» for måneden.
- **Utgifter** – beløp, kategori, beskrivelse og dato. Utgiften havner i måneden datoen tilhører.
- **Oversikt** – fargede søyler viser hvor mye av hver kategori som er brukt (grønn → gul over 80 % → rød når du er over).
- **Mål i stedet for tak** – klikk 🎯 på en kategori for å snu logikken: da er søyla rød til du passerer beløpet og grønn når du er over. Sparing er satt opp som mål fra start; ferie, nedbetaling og andre spareposter kan settes på samme måte.
- **Kontoer** – legg inn saldoen kontoen har. Inntekter legges til og utgifter trekkes fra automatisk, på tvers av måneder.
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
| `app.js` | All logikk: lagring, utregning og rendering |
| `bank-import.js` | Leser CSV fra nettbanken og gjetter format, dato, beløp og kategori |

## Om bankimport

Appen kobler seg **ikke** til banken din. Ekte kontokobling krever PSD2-tilgang gjennom en lisensiert aktør, og den gratis veien for hobbyprosjekter (Nordigen/GoCardless) er stengt for nye brukere. Derfor går veien om kontoutskriften:

1. Last ned transaksjonene som CSV – Nordea: *Kontoutskrift → Last ned*, Revolut: *Statement → Excel/CSV*.
2. Velg hvilken konto utskriften gjelder, og slipp fila i importfeltet.
3. Se over forslagene, juster kategoriene du vil endre, og legg dem inn.

Formatet gjettes automatisk: semikolon eller komma, norsk (`1 234,56`) eller engelsk (`1,234.56`) tallformat, ett beløpsfelt med fortegn eller egne kolonner for inn og ut.
