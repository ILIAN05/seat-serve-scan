# Seat Serve Scan

Bouw een webapp voor QR-bestellen in restaurants. Alle tekst in de app is in het Nederlands. Het is een demo voor een bachelorproef: er zijn geen echte betalingen nodig.

CONCEPT

Op elke restauranttafel staat een houder met een QR-code. De klant scant die, ziet het menu, bestelt vanaf zijn gsm, en de bestelling verschijnt live op een keukenscherm (tablet). Elke QR-code bevat het tafelnummer in de URL, bijvoorbeeld /tafel/7.

1. KLANTENPAGINA (/tafel/:nummer) – mobile-first

- Bovenaan: naam van het restaurant en "Tafel 7".

- Menu ingedeeld in categorieën (Voorgerechten, Hoofdgerechten, Desserts, Dranken), met tabbladen of scrollnavigatie.

- Per gerecht: naam, korte beschrijving, prijs, foto (optioneel) en allergenen als kleine icoontjes of labels.

- Knop "Toevoegen" met aantal, plus een optionele opmerking per gerecht (bv. "zonder ui").

- Winkelmandje onderaan met totaalbedrag, aanpasbare aantallen en een knop "Bestelling plaatsen".

- Na het bestellen: bevestigingsscherm met de status van de bestelling, live bijgewerkt ("Ontvangen" → "In bereiding" → "Klaar").

- Twee extra knoppen: "Ober roepen" en "Rekening vragen". Die sturen een melding naar het keukenscherm.

2. KEUKENSCHERM (/keuken) – geoptimaliseerd voor tablet in liggende stand

- Toont alle openstaande bestellingen als kaarten: tafelnummer, tijdstip, gerechten met aantallen en opmerkingen.

- Nieuwe bestellingen verschijnen in realtime, zonder te herladen, met een duidelijk geluidssignaal en visuele markering.

- Knoppen per bestelling om de status te wijzigen: "In bereiding" en "Klaar". "Klaar" verplaatst de bestelling naar een afgerond-lijst.

- Meldingen voor "Ober roepen" en "Rekening vragen" verschijnen apart bovenaan, met een knop "Afgehandeld".

- Grote, goed leesbare tekst en een kleurcode per status.

3. BEHEERPAGINA (/beheer)

- Beveiligd met een eenvoudige login (e-mail en wachtwoord). Ook /keuken is alleen toegankelijk na login.

- Gerechten en categorieën toevoegen, bewerken en verwijderen (naam, beschrijving, prijs, allergenen, foto, beschikbaar ja/nee).

- Een gerecht op "niet beschikbaar" zetten verbergt het meteen op de klantenpagina.

- Aantal tafels instellen en per tafel een QR-code genereren die naar /tafel/:nummer verwijst, downloadbaar als PNG en printbaar.

- Eenvoudig overzicht: aantal bestellingen vandaag en omzet vandaag.

DATA

Gebruik de ingebouwde backend en database met tabellen voor categorieën, gerechten, bestellingen, bestelregels en tafelmeldingen. Gebruik realtime updates voor het keukenscherm en de bestelstatus bij de klant.

DEMO-INHOUD

Vul de app vooraf met een fictief Belgisch restaurant ("Bistro De Houder") met een realistisch menu van ongeveer 15 gerechten en dranken, met prijzen in euro en allergenen volgens de 14 EU-allergenen.

DESIGN

Warm en natuurlijk, passend bij een houten tafelhouder: aardetinten, eikenhoutkleur, groen accent, veel witruimte en afgeronde hoeken. Eenvoudig genoeg dat iedereen zonder uitleg kan bestellen.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://seat-serve-scan.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/5df54517-f258-5527-8322-54e25bfa6b64).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

---

## Prototype-uitbreidingen (oktober 2026)

**Gast (`/tafel/:nummer`)**
- Meerdere bestelrondes per tafel met een lopende rekening die alle gsm's aan tafel live zien ("Jouw tafel").
- Allergiefilter (14 wettelijke allergenen): gerechten met die allergenen krijgen een waarschuwing.
- Melding als een gerecht in het mandje uitverkocht raakt, of als bestellen gepauzeerd is.
- Mandje blijft bewaard bij herladen; categorie-navigatie volgt het scrollen.

**Keuken (`/keuken`)**
- Timer per bestelling, rood na de ingestelde drempel (standaard 15 min).
- Gerechten afvinken, bestelling annuleren, "Klaar" ongedaan maken en afgewerkte bestellingen terugzetten.
- Duidelijke waarschuwing als het geluid uit staat; scherm blijft wakker (Wake Lock) en volledig-scherm-knop.
- Bestellen pauzeren rechtstreeks vanuit de keuken.

**Beheer (`/beheer`)**
- Zaaloverzicht per tafel met openstaand bedrag, meldingen en **Afrekenen** (rekening afdrukken kan ook).
- Menu: volgorde aanpassen, uitverkocht zetten. Cijfers: omzet per uur, populairste gerechten, bereidingstijd.
- Instellingen: restaurantnaam, bestellen open/dicht, drempel "te lang".

**Demo (`/demo`)**: gsm en keukentablet naast elkaar, met een knop die een drukke avond simuleert.

### Beveiliging en demomodus (migratie 0004)
- **Geheime tafelcode in elke QR-code** (`/tafel/7?k=…`). Wie enkel het tafelnummer kent, kan niet bestellen, de ober roepen of de rekening van die tafel zien. In Beheer → QR-codes maak je per tafel een nieuwe code als een QR ergens rondslingert; de oude werkt dan meteen niet meer.
- **Limieten**: max. 20 stuks per gerecht, 60 per bestelling en 12 bestellingen per tafel per 10 minuten. De gsm toont dezelfde grenzen als de server.
- **Demomodus** (Beheer → Instellingen): enkel als die aan staat, kan je een drukke avond simuleren, de dag opruimen en opent de startpagina een demotafel. Zet hem uit voor een echt restaurant: dan kan niemand nog bestellingen of betalingen wissen.
- Personeel past bestellingen, meldingen en betalingen enkel nog aan via de databasefuncties; afgevinkte gerechten in de keuken worden op de server bewaard, zodat elke tablet hetzelfde ziet.
- Keuken en zaal tonen ook tafels die over middernacht heen open staan; het afgerekende bedrag komt van de server.

### Database
Migraties `drizzle/migrations/0001_prototype.sql` t.e.m. `0004_table_codes.sql` moeten op de database toegepast zijn. **Na 0004 werken de oude QR-codes (zonder `?k=`) niet meer: print ze opnieuw vanuit Beheer → QR-codes.**

Migratie 0001 voegt toe: `settings.ordering_open`, `settings.late_after_minutes`, `orders.paid_at`, `orders.ready_at`, status `geannuleerd`,
de functie `table_bill(_table)` en een aangepaste `place_order` (weigert bestellingen als bestellen gepauzeerd is).
