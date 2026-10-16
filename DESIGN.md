---
name: Enrich Account
description: A recorded agent run on six municipalities, replayed as a working CRM tool.
colors:
  night: "#0F1B30"
  night-raised: "#14233C"
  night-select: "#1C2E4D"
  night-line: "#2A3B58"
  night-ink: "#E8ECF2"
  night-ink-muted: "#9AA6BA"
  navy: "#1B2A4A"
  paper: "#F7F7F5"
  panel: "#FDFDFC"
  panel-sunk: "#F1F0EE"
  line: "#E6E4E0"
  line-strong: "#D3D0CB"
  ink: "#16191F"
  ink-muted: "#4B5060"
  ink-faint: "#6E6F72"
  work-orange: "#F26521"
  work-orange-ink: "#B5450E"
  guide-green: "#0B6E4F"
  guide-green-on-night: "#3FBF8A"
  warning-yellow: "#F4C430"
  stop-red: "#C42B2B"
  stop-red-on-night: "#FF6B6B"
  service-blue: "#2458A6"
  data-teal: "#1A8C8C"
  data-teal-on-night: "#4CC3C0"
  green-tint: "#E3F1EA"
  green-line: "#C3DFD0"
  yellow-tint: "#FDF3D6"
  red-tint: "#FBE9E7"
  red-line: "#F0C7C2"
  orange-tint: "#FDEEE4"
  orange-soft: "#F3A06E"
typography:
  display:
    fontFamily: "Overpass Variable, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 750
    lineHeight: 1
    letterSpacing: "-0.01em"
  figure:
    fontFamily: "Overpass Mono Variable, ui-monospace, monospace"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.15
    fontFeature: "\"tnum\""
  headline:
    fontFamily: "Overpass Variable, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: 1.2
  board-title:
    fontFamily: "Overpass Variable, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.25
  brand:
    fontFamily: "Overpass Variable, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 750
    lineHeight: 1.2
  title:
    fontFamily: "Overpass Variable, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 650
    lineHeight: 1.3
  body:
    fontFamily: "Overpass Variable, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  sign-count:
    fontFamily: "Overpass Mono Variable, ui-monospace, monospace"
    fontSize: "0.5625rem"
    fontWeight: 700
    lineHeight: 1
  micro:
    fontFamily: "Overpass Mono Variable, ui-monospace, monospace"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.3
  label:
    fontFamily: "Overpass Variable, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.02em"
  data:
    fontFamily: "Overpass Mono Variable, ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 450
    lineHeight: 1.45
    fontFeature: "\"tnum\""
rounded:
  xs: "2px"
  sm: "3px"
  md: "6px"
  lg: "10px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "12": "48px"
components:
  button-primary:
    backgroundColor: "{colors.work-orange}"
    textColor: "{colors.night}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
    height: "36px"
  button-quiet:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
    height: "32px"
  answer-option:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  board-panel:
    backgroundColor: "{colors.night}"
    textColor: "{colors.night-ink}"
  record-panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
---

# Design System: Enrich Account

## 1. Overview

**Creative North Star: "The Night Run"**

Waysights' crews drive a town's roads at night and every sign lights up in the headlights. This page does the same to a municipality's website: the run board is the night drive, dark navy like Waysights' own site, and each page the agent fetches lights up as a tick on its lane. Below it, in daylight, sits the CRM record where a person decides. Two surfaces, two jobs: the machine works on the dark board, the person decides on the light record.

Status uses road-sign language. Green guide-sign rectangle for a value written, yellow warning diamond for a field that needs a person, red stop octagon for a value a check refused, blue service circle for a merge with an existing Contact, plain square for left blank. Orange is work in progress, as on a construction sign: the run in flight and the one primary button, with a navy legend on orange.

It rejects the generic AI-demo look: no essay above the product, no gradient blobs, glass, glow, emoji or badge soup, no centered hero, no walls of grey caveat text.

**Key Characteristics:**
- The product is the first screen; the dark run board sits directly under a slim header.
- Dense, labeled, measured. Numbers are big and monospaced; labels are short.
- Every status carries a shape and a word, never color alone.
- Motion only replays what happened, at the times it happened.

## 2. Colors: The Night Run Palette

Restrained on the light record, Committed navy on the run board. Status colors are the road-sign set and appear only on status.

### Primary
- **Work Orange** (#F26521): Waysights' brand orange. The primary button (navy legend on orange), the playhead, and the model-call blocks on the board. Never decoration.
- **Night** (#0F1B30): the run board surface and the header. Raised rows #14233C, selected lane #1C2E4D, rules #2A3B58.

### Status (road-sign set)
- **Guide Green** (#0B6E4F, #3FBF8A on night): written, right.
- **Warning Yellow** (#F4C430): fill of the person diamond, always with a dark outline and a dark word beside it.
- **Stop Red** (#C42B2B, #FF6B6B on night): refused by a check, wrong.
- **Service Blue** (#2458A6): merge with an existing Contact.
- **Data Teal** (#1A8C8C, #4CC3C0 on night): New York state road data requests.

### Neutral
- **Paper** (#F7F7F5) page, **Panel** (#FDFDFC) record and inspector, **Panel Sunk** (#F1F0EE) toolbars and code.
- **Ink** (#16191F), **Ink Muted** (#4B5060), **Ink Faint** (#6E6F72, labels only).
- **Line** (#E6E4E0) and **Line Strong** (#D3D0CB).

### Tints
Each status color has a pale tint for backgrounds and a line for borders: green (#E3F1EA, #C3DFD0) for used and right, yellow (#FDF3D6) for questions, red (#FBE9E7, #F0C7C2) for refused and wrong, orange (#FDEEE4) for the running strip. A soft orange (#F3A06E) marks the brief call on the board, so it reads apart from the extract call beside it.

**The One Orange Rule.** Orange marks work in progress and the one action that matters on a screen. If two things are orange and one isn't running, one is wrong.

## 3. Typography

**UI Font:** Overpass Variable (an open-source cousin of Highway Gothic, the FHWA road-sign face).
**Data Font:** Overpass Mono Variable, tabular figures.

One family for everything; the mono carries times, counts, URLs and logs. Fixed rem scale: 11, 12, 13, 14, 15, 16, 18, 22, 28, 36. The small steps are close on purpose: a dense tool needs a micro size for mono data labels and a label size beside the body size.

- **Display** (650 to 750, 28 to 36px): the counters, the tally and the road km on the record.
- **Headline** (700, 22px): the Account name.
- **Title** (650, 15px): panel and section titles.
- **Body** (400, 14px): values, questions, prose capped at 68ch.
- **Label** (600, 12px): field labels and column heads, sentence case.

## 4. Elevation

Flat. Depth comes from tone: night board, paper page, panel record. The only shadow is on floating things (the board tooltip, the How it works panel): `0 8px 24px oklch(0.2 0.04 260 / 0.18)`.

## 5. Components

- **Run board:** night surface, transport bar (play, restart, speed, scrubber, clock), counter strip, six lanes on one shared time axis. Lane parts: dotted wait line, crawl bar with one tick per HTTP request, teal ticks for state data, orange model blocks labeled with seconds, octagon or check at the checks, diamond where a person is asked, green square at write. Hover a tick for the logged step; click it to open that step.
- **Record:** Account head (name, site, status, Enrich Account button), then a field table: label, Zoho now, proposed, check, write toggle. Proposed values are links to their source line. A question sits under its field with one-click answers.
- **Inspector:** tabs for Run log, Checks, Source and Zoho. Mono text, highlighted quote lines (guide-green tint for used, stop-red tint for refused).
- **Scorecard:** six-by-six grid of sign glyphs, counts, the misses in words, and the rule-4 tolerance slider.
- **Buttons:** primary is orange with a navy legend; quiet is panel with a line border. Focus ring 2px work-orange-ink with 2px offset everywhere.

## 6. Do's and Don'ts

**Do**
- Label every replay "Recorded run, Oct 15, 2026".
- Label model steps "Claude" and code steps by what they do.
- Put a shape and a word on every status.
- Keep hints under 8 words, next to their control.

**Don't**
- Don't invent a step, a time or a count. If the run didn't log it, it doesn't show.
- Don't use side-stripe borders, gradient text, glass, glow or emoji.
- Don't write prose above the product. First view stays under 40 words of prose.
- Don't use orange for anything that isn't running or the primary action.
