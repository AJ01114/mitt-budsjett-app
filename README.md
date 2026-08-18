# 💰 Mitt budsjett

En enkel app for å budsjettere måned for måned: legg inn inntekt, sett et fast beløp per kategori (mat, bolig, transport …), og registrer utgifter som automatisk trekkes fra riktig kategori.

## Hva den gjør

- **Månedsvis budsjett** – bla mellom måneder med pilene øverst. Hver måned har sin egen inntekt, sine budsjettbeløp og sine utgifter.
- **Inntekt** – legg inn én eller flere inntektslinjer (lønn, stipend, annet).
- **Kategorier med fast beløp** – skriv f.eks. 4000 kr på «Mat og dagligvarer» for måneden.
- **Utgifter** – beløp, kategori, beskrivelse og dato. Utgiften havner i måneden datoen tilhører.
- **Oversikt** – fargede søyler viser hvor mye av hver kategori som er brukt (grønn → gul over 80 % → rød når du er over).
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
