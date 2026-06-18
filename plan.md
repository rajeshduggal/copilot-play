Problem

Build a web-component date picker (standard calendar grid) with zoomable views:
- Day view (grid of days)
- Month view (grid of months) — header shows year
- Year view (list/grid of years) — header shows decade/range

Interactions

- Clicking the month label in Day view zooms out to Month view; clicking a month in Month view zooms into Day view for that month.
- Clicking the year label in Month view zooms out to Year view; clicking a year in Year view zooms into Month view for that year.
- Clicking a month in Year -> zoom into Month view; clicking month -> Day view.
- Smooth, accessible transitions and keyboard support (arrow keys, Enter/Escape).

Files to add/modify

- src/date-picker.js — Web Component implementation (custom element, internal state, render logic)
- src/date-picker.css — Styles and transition rules
- date-picker-mocks.html — integrate new component for demo/testing

Approach

1. Implement component scaffold (customElement, attributes for value/min/max, open API).
2. Implement Day grid rendering and selection handling.
3. Implement Month view and Year view with zoom state machine and transitions.
4. Add CSS transitions and focus/keyboard behavior.
5. Integrate into date-picker-mocks.html and manual test.
6. Iterate on accessibility and edge cases (leap years, month lengths, locale firstDayOfWeek).

Notes

- Keep the component framework-agnostic (vanilla JS, Web Component).
- Start with LTR and en-US locale, expose hooks for localization later.
- Will verify in the included mocks file first; add examples for controlled/uncontrolled usage.
