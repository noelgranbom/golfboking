# Golfboking — Design System Guide for Claude

> Läs detta innan du skriver en enda rad kod eller CSS.

---

## Vad är Golfboking?

Golfboking är en automatisk tee-time-bevakare för MinGolf (mingolf.golf.se) — Svenska Golförbundets bokningsportal. Användaren loggar in med Golf-ID + MinGolf-lösenord, väljer klubb, datum och tidsintervall, och Golfboking antingen **meddelar** dem när en tid öppnas eller **bokar automatiskt**. Produkten är på **svenska från start till slut** (`lang="sv"`).

Stacken är: **Next.js 16 · React 19 · Tailwind v4 · Supabase · Resend · Anthropic SDK**.

---

## Designfilosofi

Golfboking ska kännas som ett **privat country club** — inte ett indiehackerverktyg. Lugn, auktoritativ, heritage. Tänk ett tryckt poängkort från en regional golfklubb: varje ord förtjänar sin plats, inga utropstecken i funktionellt gränssnitt, inga neonjusterade accenter.

**Tre regler:**
1. **Djupgrön clubhouse-känsla**, inte kall cyber-svart.
2. **Cormorant Garamond** för display/rubriker — heritagesignal.
3. **Mässing (brass) används sparsamt** — fokusringar, premiumindikator, monogram.

---

## Färger — använd alltid `--gb-*` tokens

Importera alltid `colors_and_type.css` (eller kopiera CSS-variablerna till `globals.css`). Uppfinn **aldrig** nya färger.

```css
/* Primära bakgrundsytor (mörkt läge — standard) */
--gb-ink:          #0a1a0e   /* nästan svart, djupaste skog */
--gb-forest-900:   #0e2a1f   /* primär app-bakgrund */
--gb-forest-800:   #122e23   /* sekundär yta */
--gb-forest-700:   #15402d   /* upphöjt kort */
--gb-forest-600:   #1c5638   /* divider / kant på mörkt */

/* Akcenter */
--gb-fairway:      #1f6b45   /* primär CTA — ej neon */
--gb-fairway-hi:   #2a8557   /* hover */
--gb-moss:         #4e8c6c   /* sekundär text på mörkt */
--gb-sage:         #a9c5b2   /* tertiär text / placeholder */
--gb-mist:         #e8f1ea   /* förgrundsfärg på mörkt */
--gb-bone:         #faf7ee   /* elfenben / pergament-yta */
--gb-bone-2:       #f1ece0   /* pergamentkant / divider på ljust */
--gb-brass:        #b58a3f   /* heritage guld — sparsamt */
--gb-brass-deep:   #8a6627   /* tryckt / dämpat guld */

/* Status — aldrig neon */
--gb-success:      #2a8557
--gb-warning:      #d8a64a   /* bärnsten, ej gult */
--gb-error:        #b94b3f   /* lerröd */
--gb-info:         #6b9bbf   /* dammig blå */
```

### Semantiska tokens (använd dessa i komponenter)
```css
--gb-bg           /* App-bakgrund */
--gb-bg-raised    /* Upphöjd yta */
--gb-bg-card      /* rgba(255,255,255,0.03) */
--gb-bg-input     /* rgba(255,255,255,0.04) */
--gb-border       /* rgba(255,255,255,0.08) */
--gb-border-strong/* rgba(255,255,255,0.14) */
--gb-fg           /* Primär text */
--gb-fg-muted     /* Dämpad text 55% */
--gb-fg-soft      /* Mjuk text 30% */
--gb-fg-faint     /* Svag text 15% */
--gb-accent       /* = --gb-fairway */
--gb-accent-hi    /* = --gb-fairway-hi */
--gb-on-accent    /* Text ovanpå accent */
```

### Ljust läge (e-post, utskrifter)
Lägg `.gb-light` på root-elementet — tokens byter automatiskt till elfenbensbakgrund.

---

## Typografi

| Font | Användning | CSS-variabel |
|------|------------|--------------|
| Cormorant Garamond | Rubriker, display, eyebrow | `--gb-font-display` |
| Geist | Body, knappar, labels | `--gb-font-sans` |
| Geist Mono | Loggar, Golf-ID, tid/datum | `--gb-font-mono` |

### Hjälpklasser (använd dessa, inte `text-*` Tailwind-klasser direkt)
```
.gb-display   → 64px, Cormorant, marketing hero
.gb-h1        → 36px, Cormorant
.gb-h2        → 28px, Cormorant
.gb-h3        → 22px, Cormorant
.gb-eyebrow   → 16px, Cormorant italic, dämpad — descriptor over sections
.gb-label     → 11px, Geist, 0.14em tracking, VERSALER — fältlabels
.gb-body      → 16px, Geist
.gb-body-sm   → 14px, Geist, dämpad
.gb-caption   → 12px, Geist, mjuk
.gb-mono      → 12px, Geist Mono
.gb-tabular   → tabular-nums för tider/räknare
```

**Alltid sentence case.** `Sök tid` — inte `Sök Tid`. Enda undantag: `.gb-label` (uppercased via CSS).

---

## Spacing — 4-pt baslinje

```
--gb-space-1:   4px
--gb-space-2:   8px
--gb-space-3:  12px
--gb-space-4:  16px    ← vertikal rytm i formulär
--gb-space-5:  20px
--gb-space-6:  24px
--gb-space-8:  32px    ← sektionsbrytningar
--gb-space-10: 40px    ← sektionsbrytningar
--gb-space-12: 48px
--gb-space-16: 64px
--gb-space-20: 80px
```

---

## Radier

```
--gb-radius-sm:   6px    chips, inline-badges
--gb-radius-md:   12px   inputs
--gb-radius-lg:   16px   knappar
--gb-radius-xl:   20px   kort
--gb-radius-2xl:  28px   feature-paneler
--gb-radius-pill: 999px
```

---

## Skuggor

```
--gb-shadow-sm      chips, pills
--gb-shadow-md      upphöjda kort (standard elevation)
--gb-shadow-lg      modaler, flytande menyer
--gb-shadow-emboss  inset 1px top highlight på mörka knappar
--gb-ring-focus     0 0 0 3px rgba(181,138,63,0.35) — mässingsfokusring (keyboard)
--gb-ring-accent    0 0 0 3px rgba(31,107,69,0.30)  — grön fokusring (inputs)
```

---

## Motion

```
--gb-ease:     cubic-bezier(0.22, 0.61, 0.36, 1)
--gb-ease-out: cubic-bezier(0.16, 1, 0.30, 1)
--gb-dur-fast: 120ms   hover
--gb-dur-base: 200ms   tillståndsövergångar
--gb-dur-slow: 320ms   panelrevelations
```

**Inga studsar. Inga spring physics. Inga parallax-effekter.**

---

## Komponenter — beteenderegler

### Knappar
- **Primär:** `background: --gb-fairway`, `border-radius: 16px`, Geist weight 500
- **Hover:** bakgrund → `--gb-fairway-hi`, 120ms
- **Press:** bakgrund → `--gb-fairway` (ett steg mörkare än hover), inset shadow
- **Inga transform/scale-tricks**
- Text: `--gb-on-accent` (elfenben)

### Inputs
- Border visas alltid (inte borderless)
- `border-radius: 12px`, `background: --gb-bg-input`
- **Focus:** border → `--gb-fairway` + `--gb-ring-accent` glöd
- **Keyboard focus:** `--gb-ring-focus` (mässingsfärgad)

### Kort / Cards
- `background: rgba(255,255,255,0.03)` tint
- Border: `rgba(255,255,255,0.08)` hairline
- `border-radius: 20px` (standard) eller `28px` (feature-panel)
- **Ingen vänsterkantakcentfärg** — vi undviker det web-startup-tröpet
- Padding: 24px (sm) / 28px (default) / 32px (feature)
- Hover: border → `rgba(255,255,255,0.20)`, **ingen transform**

### Badges
- `border-radius: 6px` (inline) eller `999px` (pill)
- Geist, 12px, weight 500
- Status-färger: dämpade varianter av `--gb-success/warning/error/info`

---

## Ikonografi

Använd **Lucide**-ikoner (är redan en dependency). Aldrig emoji i produktgränssnittet.

```tsx
// React
import { Bell, Zap, CalendarDays, Check, X, TriangleAlert } from 'lucide-react'

// CDN för prototyper
// https://unpkg.com/lucide-static@0.469.0/icons/<name>.svg
```

**Lucide-inställningar:**
- Stroke: 1.75px, rounded join/cap
- Storlek: 20px (formulärrader), 16px (inline chips), 24px (kortheaders)
- Färg: `currentColor`, standard `var(--gb-fg-muted)`, aktiv `var(--gb-accent)`
- **Endast outline-varianter** — aldrig filled

| Ersätt | Med |
|--------|-----|
| ⛳ varumärke | `assets/flag-mark.svg` (SVG inline) |
| 🔔 Notis-läge | `<Bell />` |
| ⚡ Auto-läge | `<Zap />` |
| ⚠ varning | `<TriangleAlert />` |
| ✓ success | `<Check />` |
| ✗ fel | `<X />` |

---

## Varumärke / Logotyp

- **Wordmark:** "Golfboking" i Cormorant Garamond, weight 500, italic, letter-spacing -0.02em
- Färg: `--gb-mist` på mörkt, `--gb-ink` på ljust
- Paras ev. med `assets/flag-mark.svg` (SVG flagga) till vänster
- **Ingen grafisk logofil** — wordmarket ÄR logotypen
- Monogram "G": `assets/monogram-G.svg` för favicon och headers

---

## Layout

- **Mobile-first** — appen är centrerad med `max-w-lg` (≈512px)
- Känn: native-app-liknande, inte typisk webblayout
- Ingen fast header — varumärket sitter överst i scroll och försvinner
- Sektionsbrytningar: alltid `--gb-space-10` (40px) eller `--gb-space-12` (48px)

---

## Innehåll & språk

**Svenska ALLTID i produktgränssnittet.** `<html lang="sv">`. Aldrig engelska i UI.

### Rätt termer
| Begrepp | Använd |
|---------|--------|
| Tee time | **golftid** / **tid** |
| Bokning | **bokning** (verb: `boka`) |
| Bevakare | **bevakare** / **bevakning** |
| Notify mode | **Notis** |
| Auto mode | **Auto** |
| Golftidssökning | Steg **Sök tid** |
| Klockslag | `kl. 07:00` (med `kl.`) |
| Tidsintervall | `07:00–12:00` (med tankstreck `–`) |

### Ton
- **Direkt, nykter, tilltalande med `du`**
- Inga utropstecken i funktionellt UI (`!` reserveras för genuina tillståndsskiften, t.ex. bekräftelsemail)
- Sentence case: `Sök tid`, inte `Sök Tid`
- Knappar: enkla verb — `Fortsätt`, `Aktivera`, `Tillbaka`
- Inga emoji i produktgränssnittet

---

## Bakgrunder & dekorationer

- **Solid forest-grön** — inga gradient-bakgrunder i primärt UI
- Tillåten dekoration: subtilt brus/grain-overlay (~3% opacity) på hero och e-posthuvuden
- **Inga stockfoton** i produkt-UI
- **Inga mönster eller handritade illustrationer**

---

## globals.css — vad du bör uppdatera

Den befintliga `globals.css` använder gamla tokens (`--background: #0a1a0a`, `--accent: #22c55e` etc.). Ersätt med detta:

```css
@import "tailwindcss";
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap');

:root {
  --gb-ink:          #0a1a0e;
  --gb-forest-900:   #0e2a1f;
  --gb-forest-800:   #122e23;
  --gb-forest-700:   #15402d;
  --gb-forest-600:   #1c5638;
  --gb-fairway:      #1f6b45;
  --gb-fairway-hi:   #2a8557;
  --gb-moss:         #4e8c6c;
  --gb-sage:         #a9c5b2;
  --gb-mist:         #e8f1ea;
  --gb-bone:         #faf7ee;
  --gb-bone-2:       #f1ece0;
  --gb-brass:        #b58a3f;
  --gb-brass-deep:   #8a6627;

  --gb-success:      #2a8557;
  --gb-warning:      #d8a64a;
  --gb-error:        #b94b3f;
  --gb-info:         #6b9bbf;

  /* Semantiska tokens */
  --gb-bg:           var(--gb-forest-900);
  --gb-bg-raised:    var(--gb-forest-800);
  --gb-bg-card:      rgba(255,255,255,0.03);
  --gb-bg-input:     rgba(255,255,255,0.04);
  --gb-border:       rgba(255,255,255,0.08);
  --gb-border-strong:rgba(255,255,255,0.14);
  --gb-fg:           var(--gb-mist);
  --gb-fg-muted:     rgba(232,241,234,0.55);
  --gb-fg-soft:      rgba(232,241,234,0.30);
  --gb-fg-faint:     rgba(232,241,234,0.15);
  --gb-accent:       var(--gb-fairway);
  --gb-accent-hi:    var(--gb-fairway-hi);
  --gb-on-accent:    var(--gb-bone);

  --gb-font-display: 'Cormorant Garamond', Georgia, serif;
  --gb-font-sans:    'Geist', ui-sans-serif, system-ui, sans-serif;
  --gb-font-mono:    'Geist Mono', ui-monospace, Menlo, monospace;

  --gb-space-1: 4px; --gb-space-2: 8px; --gb-space-3: 12px;
  --gb-space-4: 16px; --gb-space-5: 20px; --gb-space-6: 24px;
  --gb-space-8: 32px; --gb-space-10: 40px; --gb-space-12: 48px;
  --gb-space-16: 64px; --gb-space-20: 80px;

  --gb-radius-sm: 6px; --gb-radius-md: 12px; --gb-radius-lg: 16px;
  --gb-radius-xl: 20px; --gb-radius-2xl: 28px; --gb-radius-pill: 999px;

  --gb-shadow-sm: 0 1px 2px rgba(0,0,0,0.20);
  --gb-shadow-md: 0 4px 14px rgba(0,0,0,0.28), 0 1px 2px rgba(0,0,0,0.18);
  --gb-shadow-lg: 0 18px 40px -16px rgba(0,0,0,0.55), 0 2px 4px rgba(0,0,0,0.20);
  --gb-shadow-emboss: inset 0 1px 0 rgba(255,255,255,0.06);
  --gb-ring-focus: 0 0 0 3px rgba(181,138,63,0.35);
  --gb-ring-accent: 0 0 0 3px rgba(31,107,69,0.30);

  --gb-ease:     cubic-bezier(0.22, 0.61, 0.36, 1);
  --gb-ease-out: cubic-bezier(0.16, 1, 0.30, 1);
  --gb-dur-fast: 120ms; --gb-dur-base: 200ms; --gb-dur-slow: 320ms;
}

body {
  font-family: var(--gb-font-sans);
  font-size: 16px;
  line-height: 1.55;
  color: var(--gb-fg);
  background: var(--gb-bg);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
```

---

## Tailwind — mappning

Använd CSS-variablerna direkt med `[var(--gb-*)]`-syntax i Tailwind v4, eller lägg till i `tailwind.config`:

```tsx
// Exempel på rätt Tailwind-användning med --gb-tokens
<div className="bg-[var(--gb-bg-card)] border border-[var(--gb-border)] rounded-[var(--gb-radius-xl)] p-6">
  <h2 className="font-[family-name:var(--gb-font-display)] text-[var(--gb-fg)]">
    Aktiv bevakning
  </h2>
</div>

// Knappar
<button className="bg-[var(--gb-fairway)] hover:bg-[var(--gb-fairway-hi)] text-[var(--gb-on-accent)] rounded-[var(--gb-radius-lg)] px-5 py-3 transition-colors duration-[120ms]">
  Aktivera
</button>
```

---

## Checklista innan du pushar kod

- [ ] Alla färger är `--gb-*` tokens — inga hårdkodade hex
- [ ] Rubriker använder `--gb-font-display` (Cormorant Garamond)
- [ ] All text är på svenska
- [ ] Inga emoji i UI
- [ ] Knappar har `border-radius: var(--gb-radius-lg)`
- [ ] Kort har `border-radius: var(--gb-radius-xl)` eller `--gb-radius-2xl`
- [ ] Ikoner är från Lucide, stroke 1.75px
- [ ] Animationer följer `--gb-dur-*` och `--gb-ease`
- [ ] Inga neon-gröna (`#22c55e`) rester från gamla paletten
