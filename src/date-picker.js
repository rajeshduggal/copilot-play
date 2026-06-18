const DEFAULT_LOCALE = 'en-US';
const DEFAULT_FIRST_DAY_OF_WEEK = 0;
const YEAR_VIEW_SPAN = 10;
const YEAR_VIEW_COLUMNS = 5;
const MONTH_VIEW_COLUMNS = 4;

// Module-level Intl formatter cache — avoids rebuilding per-cell per-render.
const _formatterCache = new Map();

function getCachedFormatter(locale, options) {
  const key = `${locale}|${JSON.stringify(options)}`;
  if (!_formatterCache.has(key)) {
    _formatterCache.set(key, new Intl.DateTimeFormat(locale, options));
  }
  return _formatterCache.get(key);
}

function htmlEscape(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function validateLocale(locale) {
  try {
    new Intl.DateTimeFormat(locale);
    return locale;
  } catch {
    console.warn(`[date-picker] Invalid locale "${locale}", falling back to ${DEFAULT_LOCALE}.`);
    return DEFAULT_LOCALE;
  }
}

function createDate(year, month, day) {
  return new Date(year, month, day, 12);
}

function normalizeDate(date) {
  return createDate(date.getFullYear(), date.getMonth(), date.getDate());
}

function today() {
  return normalizeDate(new Date());
}

function daysInMonth(year, month) {
  return createDate(year, month + 1, 0).getDate();
}

function parseDateString(value) {
  if (!value) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = createDate(year, month, day);

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function formatDateString(date) {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function compareDates(left, right) {
  const leftKey = left.getFullYear() * 10_000 + (left.getMonth() + 1) * 100 + left.getDate();
  const rightKey = right.getFullYear() * 10_000 + (right.getMonth() + 1) * 100 + right.getDate();

  return Math.sign(leftKey - rightKey);
}

function isSameDay(left, right) {
  return compareDates(left, right) === 0;
}

function addDays(date, amount) {
  return createDate(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

function addMonths(date, amount) {
  const target = createDate(date.getFullYear(), date.getMonth() + amount, 1);
  const day = Math.min(date.getDate(), daysInMonth(target.getFullYear(), target.getMonth()));

  return createDate(target.getFullYear(), target.getMonth(), day);
}

function addYears(date, amount) {
  return addMonths(date, amount * 12);
}

function startOfMonth(date) {
  return createDate(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return createDate(date.getFullYear(), date.getMonth(), daysInMonth(date.getFullYear(), date.getMonth()));
}

function startOfYear(year) {
  return createDate(year, 0, 1);
}

function endOfYear(year) {
  return createDate(year, 11, 31);
}

function clampDate(date, minDate, maxDate) {
  if (minDate && compareDates(date, minDate) < 0) {
    return minDate;
  }

  if (maxDate && compareDates(date, maxDate) > 0) {
    return maxDate;
  }

  return date;
}

function isWithinRange(date, minDate, maxDate) {
  return clampDate(date, minDate, maxDate) === date;
}

function monthIntersectsRange(date, minDate, maxDate) {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);

  if (minDate && compareDates(monthEnd, minDate) < 0) {
    return false;
  }

  if (maxDate && compareDates(monthStart, maxDate) > 0) {
    return false;
  }

  return true;
}

function yearIntersectsRange(year, minDate, maxDate) {
  const yearStart = startOfYear(year);
  const yearEnd = endOfYear(year);

  if (minDate && compareDates(yearEnd, minDate) < 0) {
    return false;
  }

  if (maxDate && compareDates(yearStart, maxDate) > 0) {
    return false;
  }

  return true;
}

function yearSpanIntersectsRange(startYear, minDate, maxDate) {
  return Array.from({ length: YEAR_VIEW_SPAN }, (_, index) => yearIntersectsRange(startYear + index, minDate, maxDate)).some(Boolean);
}

function startOfWeek(date, firstDayOfWeek) {
  let cursor = normalizeDate(date);

  while (cursor.getDay() !== firstDayOfWeek) {
    cursor = addDays(cursor, -1);
  }

  return cursor;
}

function getMonthName(date, locale, format = 'long') {
  return getCachedFormatter(locale, { month: format }).format(date);
}

function getAccessibleDateLabel(date, locale) {
  return getCachedFormatter(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function getVisibleWeekdayLabels(locale, firstDayOfWeek) {
  // Use a reference week starting on the Sunday of ISO week 1 of year 2000,
  // which is guaranteed to be a Sunday regardless of locale or DST.
  const baseSunday = createDate(2000, 0, 2); // 2000-01-02 is a Sunday

  return Array.from({ length: 7 }, (_, index) => {
    const weekday = addDays(baseSunday, (firstDayOfWeek + index) % 7);
    return getCachedFormatter(locale, { weekday: 'short' }).format(weekday);
  });
}

export class DatePicker extends HTMLElement {
  static observedAttributes = ['value', 'min', 'max', 'open', 'locale', 'first-day-of-week', 'label', 'placeholder'];

  static _instanceCount = 0;

  constructor() {
    super();

    this.attachShadow({ mode: 'open' });

    DatePicker._instanceCount += 1;
    this._panelId = `date-picker-panel-${DatePicker._instanceCount}`;
    this._styleHref = new URL('./date-picker.css', import.meta.url).href;
    this._rootElement = null;
    this._view = 'day';
    this._open = false;
    this._minDate = null;
    this._maxDate = null;
    this._valueDate = null;
    this._focusedDate = today();
    this._viewDate = startOfMonth(this._focusedDate);
    this._locale = DEFAULT_LOCALE;
    this._firstDayOfWeek = DEFAULT_FIRST_DAY_OF_WEEK;
    this._connected = false;

    this._onClick = this._onClick.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onDocumentPointerDown = this._onDocumentPointerDown.bind(this);
  }

  connectedCallback() {
    if (this._connected) {
      return;
    }

    this._connected = true;
    this.shadowRoot.addEventListener('click', this._onClick);
    this.shadowRoot.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('pointerdown', this._onDocumentPointerDown);
    this._ensureRoot();

    this._syncFromAttributes();
    this.render();
  }

  disconnectedCallback() {
    if (!this._connected) {
      return;
    }

    this._connected = false;
    this.shadowRoot.removeEventListener('click', this._onClick);
    this.shadowRoot.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('pointerdown', this._onDocumentPointerDown);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue || !this.isConnected) {
      return;
    }

    if (name === 'open' && newValue === null) {
      this._view = 'day';
    }

    this._syncFromAttributes();
    this.render();
  }

  get value() {
    return this._valueDate ? formatDateString(this._valueDate) : '';
  }

  set value(nextValue) {
    if (nextValue === null || nextValue === '') {
      this.removeAttribute('value');
      return;
    }

    if (nextValue instanceof Date) {
      this.setAttribute('value', formatDateString(normalizeDate(nextValue)));
      return;
    }

    this.setAttribute('value', String(nextValue));
  }

  get min() {
    return this.getAttribute('min') ?? '';
  }

  set min(nextValue) {
    if (nextValue === null || nextValue === '') {
      this.removeAttribute('min');
      return;
    }

    this.setAttribute('min', String(nextValue));
  }

  get max() {
    return this.getAttribute('max') ?? '';
  }

  set max(nextValue) {
    if (nextValue === null || nextValue === '') {
      this.removeAttribute('max');
      return;
    }

    this.setAttribute('max', String(nextValue));
  }

  get open() {
    return this._open;
  }

  set open(nextValue) {
    this.toggleAttribute('open', Boolean(nextValue));
  }

  showPicker() {
    this.open = true;
  }

  hidePicker() {
    this.open = false;
  }

  togglePicker(force) {
    if (typeof force === 'boolean') {
      this.open = force;
      return;
    }

    this.open = !this.open;
  }

  _readDateAttribute(name) {
    const rawValue = this.getAttribute(name);

    if (!rawValue) {
      return null;
    }

    const parsedValue = parseDateString(rawValue);

    if (!parsedValue) {
      console.warn(`[date-picker] Ignoring invalid ${name}="${rawValue}". Expected YYYY-MM-DD.`);
      return null;
    }

    return parsedValue;
  }

  _syncFromAttributes() {
    this._locale = validateLocale(this.getAttribute('locale') || DEFAULT_LOCALE);

    const parsedFirstDay = Number.parseInt(this.getAttribute('first-day-of-week') ?? String(DEFAULT_FIRST_DAY_OF_WEEK), 10);
    this._firstDayOfWeek =
      Number.isInteger(parsedFirstDay) && parsedFirstDay >= 0 && parsedFirstDay <= 6
        ? parsedFirstDay
        : DEFAULT_FIRST_DAY_OF_WEEK;

    this._minDate = this._readDateAttribute('min');
    this._maxDate = this._readDateAttribute('max');

    if (this._minDate && this._maxDate && compareDates(this._minDate, this._maxDate) > 0) {
      console.warn('[date-picker] Received min greater than max. Treating max as the effective bound.');
      this._minDate = this._maxDate;
    }

    const nextValue = this._readDateAttribute('value');
    const clampedValue = nextValue ? clampDate(nextValue, this._minDate, this._maxDate) : null;
    this._valueDate = clampedValue;

    // Reflect clamped value back to the attribute so the DOM stays consistent.
    if (nextValue && clampedValue && !isSameDay(nextValue, clampedValue)) {
      queueMicrotask(() => {
        if (this.isConnected) {
          this.setAttribute('value', formatDateString(clampedValue));
        }
      });
    }

    this._open = this.hasAttribute('open');

    const fallbackFocus = clampDate(today(), this._minDate, this._maxDate);
    this._focusedDate = clampDate(this._valueDate || this._focusedDate || fallbackFocus, this._minDate, this._maxDate);
    this._viewDate = startOfMonth(this._valueDate || this._focusedDate);
  }

  _onDocumentPointerDown(event) {
    if (!this._open) {
      return;
    }

    const path = event.composedPath();

    if (!path.includes(this)) {
      this.hidePicker();
    }
  }

  _onClick(event) {
    const actionTarget = event.target.closest('[data-action], [data-date], [data-month], [data-year]');

    if (!actionTarget) {
      return;
    }

    if (actionTarget.dataset.action === 'toggle') {
      this.togglePicker();

      if (this._open) {
        this._focusActiveCell();
      }

      return;
    }

    if (!this._open) {
      this.showPicker();
      this._focusActiveCell();
      return;
    }

    const { action } = actionTarget.dataset;

    if (action === 'previous') {
      this._stepView(-1);
      return;
    }

    if (action === 'next') {
      this._stepView(1);
      return;
    }

    if (action === 'show-months') {
      this._view = 'month';
      this.render();
      this._focusActiveCell();
      return;
    }

    if (action === 'show-years') {
      this._view = 'year';
      this.render();
      this._focusActiveCell();
      return;
    }

    if (action === 'today') {
      const todayDate = today();

      if (!isWithinRange(todayDate, this._minDate, this._maxDate)) {
        return;
      }

      this._selectDate(todayDate);
      return;
    }

    if (action === 'clear') {
      if (!this._valueDate) {
        return;
      }

      this.removeAttribute('value');
      this.hidePicker();
      this._focusTrigger();
      this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      return;
    }

    if (actionTarget.dataset.date) {
      const date = parseDateString(actionTarget.dataset.date);

      if (date && isWithinRange(date, this._minDate, this._maxDate)) {
        this._selectDate(date);
      }

      return;
    }

    if (actionTarget.dataset.month) {
      const monthIndex = Number(actionTarget.dataset.month);
      const nextFocusedDate = clampDate(
        createDate(this._viewDate.getFullYear(), monthIndex, Math.min(this._focusedDate.getDate(), daysInMonth(this._viewDate.getFullYear(), monthIndex))),
        this._minDate,
        this._maxDate,
      );

      this._focusedDate = nextFocusedDate;
      this._viewDate = startOfMonth(nextFocusedDate);
      this._view = 'day';
      this.render();
      this._focusActiveCell();
      return;
    }

    if (actionTarget.dataset.year) {
      const year = Number(actionTarget.dataset.year);
      const nextFocusedDate = clampDate(
        createDate(year, this._focusedDate.getMonth(), Math.min(this._focusedDate.getDate(), daysInMonth(year, this._focusedDate.getMonth()))),
        this._minDate,
        this._maxDate,
      );

      this._focusedDate = nextFocusedDate;
      this._viewDate = startOfMonth(nextFocusedDate);
      this._view = 'month';
      this.render();
      this._focusActiveCell();
    }
  }

  _onKeyDown(event) {
    const trigger = event.target.closest('.picker__trigger');

    if (trigger && ['ArrowDown', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      this.showPicker();
      this._focusActiveCell();
      return;
    }

    if (!this._open) {
      return;
    }

    // Tab focus trap — cycle through all non-disabled buttons in the panel.
    if (event.key === 'Tab') {
      const panel = this.shadowRoot.querySelector('.picker__panel');
      const focusable = panel
        ? [...panel.querySelectorAll('button:not([disabled])')].filter((b) => b.tabIndex !== -1)
        : [];
      if (focusable.length > 0) {
        const active = this.shadowRoot.activeElement;
        const idx = focusable.indexOf(active);
        event.preventDefault();
        if (event.shiftKey) {
          (idx > 0 ? focusable[idx - 1] : focusable[focusable.length - 1]).focus({ preventScroll: true });
        } else {
          (idx < focusable.length - 1 ? focusable[idx + 1] : focusable[0]).focus({ preventScroll: true });
        }
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();

      if (this._view === 'year') {
        this._view = 'month';
        this.render();
        this._focusActiveCell();
        return;
      }

      if (this._view === 'month') {
        this._view = 'day';
        this.render();
        this._focusActiveCell();
        return;
      }

      this.hidePicker();
      this._focusTrigger();
      return;
    }

    // Home / End — first or last cell of the current view period.
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      this._moveToEdge(event.key === 'Home' ? 'start' : 'end');
      return;
    }

    // PageUp / PageDown — navigate one period in the active view.
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault();
      this._stepView(event.key === 'PageUp' ? -1 : 1);
      return;
    }

    const arrowOffsets =
      this._view === 'day'
        ? { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
        : this._view === 'month'
        ? { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -MONTH_VIEW_COLUMNS, ArrowDown: MONTH_VIEW_COLUMNS }
        : { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -YEAR_VIEW_COLUMNS, ArrowDown: YEAR_VIEW_COLUMNS };

    if (Object.hasOwn(arrowOffsets, event.key)) {
      event.preventDefault();
      this._moveFocus(arrowOffsets[event.key]);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      // Only take over Enter/Space when a grid cell has focus.
      // For nav and footer buttons the browser's built-in click dispatch is sufficient.
      if (event.target.closest('[role="gridcell"]')) {
        event.preventDefault();
        this._commitFocusedValue();
      }
    }
  }

  _moveToEdge(edge) {
    if (this._view === 'day') {
      const target = edge === 'start' ? startOfMonth(this._viewDate) : endOfMonth(this._viewDate);
      this._focusedDate = clampDate(target, this._minDate, this._maxDate);
    } else if (this._view === 'month') {
      const year = this._viewDate.getFullYear();
      const target = edge === 'start' ? createDate(year, 0, 1) : createDate(year, 11, 31);
      this._focusedDate = clampDate(target, this._minDate, this._maxDate);
      this._viewDate = startOfMonth(this._focusedDate);
    } else {
      const rangeStart = this._getYearRangeStart();
      const year = edge === 'start' ? rangeStart : rangeStart + YEAR_VIEW_SPAN - 1;
      const target = createDate(year, this._focusedDate.getMonth(), 1);
      this._focusedDate = clampDate(target, this._minDate, this._maxDate);
      this._viewDate = startOfMonth(this._focusedDate);
    }
    this.render();
    this._focusActiveCell();
  }

  _stepView(direction) {
    if (this._view === 'day') {
      const nextMonth = addMonths(this._viewDate, direction);

      if (!monthIntersectsRange(nextMonth, this._minDate, this._maxDate)) {
        return;
      }

      this._viewDate = startOfMonth(nextMonth);
      this._focusedDate = clampDate(
        createDate(
          this._viewDate.getFullYear(),
          this._viewDate.getMonth(),
          Math.min(this._focusedDate.getDate(), daysInMonth(this._viewDate.getFullYear(), this._viewDate.getMonth())),
        ),
        this._minDate,
        this._maxDate,
      );
      this.render();
      this._focusActiveCell();
      return;
    }

    if (this._view === 'month') {
      const nextYearDate = addYears(this._viewDate, direction);

      if (!yearIntersectsRange(nextYearDate.getFullYear(), this._minDate, this._maxDate)) {
        return;
      }

      this._viewDate = startOfMonth(nextYearDate);
      this._focusedDate = clampDate(
        createDate(
          this._viewDate.getFullYear(),
          this._focusedDate.getMonth(),
          Math.min(this._focusedDate.getDate(), daysInMonth(this._viewDate.getFullYear(), this._focusedDate.getMonth())),
        ),
        this._minDate,
        this._maxDate,
      );
      this.render();
      this._focusActiveCell();
      return;
    }

    const startYear = this._getYearRangeStart();
    const nextStartYear = startYear + direction * YEAR_VIEW_SPAN;

    if (!yearSpanIntersectsRange(nextStartYear, this._minDate, this._maxDate)) {
      return;
    }

    this._viewDate = startOfMonth(createDate(nextStartYear, this._viewDate.getMonth(), 1));
    this._focusedDate = clampDate(
      createDate(this._viewDate.getFullYear(), this._focusedDate.getMonth(), Math.min(this._focusedDate.getDate(), daysInMonth(this._viewDate.getFullYear(), this._focusedDate.getMonth()))),
      this._minDate,
      this._maxDate,
    );
    this.render();
    this._focusActiveCell();
  }

  _moveFocus(offset) {
    if (this._view === 'day') {
      const nextDate = clampDate(addDays(this._focusedDate, offset), this._minDate, this._maxDate);
      this._focusedDate = nextDate;
      this._viewDate = startOfMonth(nextDate);
      this.render();
      this._focusActiveCell();
      return;
    }

    if (this._view === 'month') {
      const nextDate = clampDate(addMonths(this._focusedDate, offset), this._minDate, this._maxDate);
      this._focusedDate = nextDate;
      this._viewDate = startOfMonth(nextDate);
      this.render();
      this._focusActiveCell();
      return;
    }

    const nextDate = clampDate(addYears(this._focusedDate, offset), this._minDate, this._maxDate);
    this._focusedDate = nextDate;
    this._viewDate = startOfMonth(nextDate);
    this.render();
    this._focusActiveCell();
  }

  _commitFocusedValue() {
    if (this._view === 'day') {
      this._selectDate(this._focusedDate);
      return;
    }

    if (this._view === 'month') {
      this._viewDate = startOfMonth(this._focusedDate);
      this._view = 'day';
      this.render();
      this._focusActiveCell();
      return;
    }

    this._viewDate = startOfMonth(this._focusedDate);
    this._view = 'month';
    this.render();
    this._focusActiveCell();
  }

  _selectDate(date) {
    this._focusedDate = date;
    this._viewDate = startOfMonth(date);
    this.setAttribute('value', formatDateString(date));
    this.hidePicker();
    this._focusTrigger();
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  _focusTrigger() {
    this.shadowRoot.querySelector('.picker__trigger')?.focus({ preventScroll: true });
  }

  _focusActiveCell() {
    queueMicrotask(() => {
      const target = this.shadowRoot.querySelector('[data-focused="true"]');
      target?.focus({ preventScroll: true });
    });
  }

  _getYearRangeStart() {
    return Math.floor(this._viewDate.getFullYear() / 10) * 10;
  }

  _canStepView(direction) {
    if (this._view === 'day') {
      return monthIntersectsRange(addMonths(this._viewDate, direction), this._minDate, this._maxDate);
    }

    if (this._view === 'month') {
      return yearIntersectsRange(addYears(this._viewDate, direction).getFullYear(), this._minDate, this._maxDate);
    }

    return yearSpanIntersectsRange(this._getYearRangeStart() + direction * YEAR_VIEW_SPAN, this._minDate, this._maxDate);
  }

  _renderHeader() {
    const previousDisabled = !this._canStepView(-1);
    const nextDisabled = !this._canStepView(1);

    if (this._view === 'day') {
      return `
        <div class="picker__header">
          <button type="button" class="picker__nav" data-action="previous" aria-label="Previous month" ${previousDisabled ? 'disabled' : ''}>&lsaquo;</button>
          <button type="button" class="picker__heading picker__heading--primary" data-action="show-months">
            ${getMonthName(this._viewDate, this._locale)} ${this._viewDate.getFullYear()}
          </button>
          <button type="button" class="picker__nav" data-action="next" aria-label="Next month" ${nextDisabled ? 'disabled' : ''}>&rsaquo;</button>
        </div>
      `;
    }

    if (this._view === 'month') {
      return `
        <div class="picker__header">
          <button type="button" class="picker__nav" data-action="previous" aria-label="Previous year" ${previousDisabled ? 'disabled' : ''}>&lsaquo;</button>
          <button type="button" class="picker__heading picker__heading--primary" data-action="show-years">
            ${this._viewDate.getFullYear()}
          </button>
          <button type="button" class="picker__nav" data-action="next" aria-label="Next year" ${nextDisabled ? 'disabled' : ''}>&rsaquo;</button>
        </div>
      `;
    }

    const rangeStart = this._getYearRangeStart();
    const labelStart = rangeStart;
    const labelEnd = rangeStart + YEAR_VIEW_SPAN - 1;

    return `
      <div class="picker__header">
        <button type="button" class="picker__nav" data-action="previous" aria-label="Previous year range" ${previousDisabled ? 'disabled' : ''}>&lsaquo;</button>
        <div class="picker__heading picker__heading--static">${labelStart}&ndash;${labelEnd}</div>
        <button type="button" class="picker__nav" data-action="next" aria-label="Next year range" ${nextDisabled ? 'disabled' : ''}>&rsaquo;</button>
      </div>
    `;
  }

  _renderDayView() {
    const weekdayLabels = getVisibleWeekdayLabels(this._locale, this._firstDayOfWeek);
    const monthStart = startOfMonth(this._viewDate);
    const gridStart = startOfWeek(monthStart, this._firstDayOfWeek);
    const todayDate = today();

    // Build 6 weeks of 7 days, grouped into ARIA rows for screen readers.
    const rows = Array.from({ length: 6 }, (_, rowIndex) => {
      const cells = Array.from({ length: 7 }, (_, colIndex) => {
        const date = addDays(gridStart, rowIndex * 7 + colIndex);
        const outsideMonth = date.getMonth() !== monthStart.getMonth();
        const selected = Boolean(this._valueDate && isSameDay(this._valueDate, date));
        const focused = isSameDay(this._focusedDate, date);
        const currentDay = isSameDay(todayDate, date);
        const disabled = !isWithinRange(date, this._minDate, this._maxDate);

        return `
          <button
            role="gridcell"
            type="button"
            class="picker__cell picker__cell--day${outsideMonth ? ' is-outside' : ''}${selected ? ' is-selected' : ''}${currentDay ? ' is-today' : ''}"
            data-date="${formatDateString(date)}"
            data-focused="${focused}"
            aria-selected="${selected}"
            ${currentDay ? 'aria-current="date"' : ''}
            aria-label="${htmlEscape(getAccessibleDateLabel(date, this._locale))}"
            ${disabled ? 'disabled' : ''}
            tabindex="${focused ? '0' : '-1'}"
          >
            <span aria-hidden="true">${date.getDate()}</span>
          </button>
        `;
      }).join('');

      return `<div role="row" style="display:contents">${cells}</div>`;
    }).join('');

    const colHeaders = weekdayLabels
      .map((lbl) => `<span role="columnheader" class="picker__weekday" aria-label="${htmlEscape(lbl)}">${htmlEscape(lbl)}</span>`)
      .join('');

    return `
      <div class="picker__body" data-view="day">
        ${this._renderHeader()}
        <div
          class="picker__grid picker__grid--days"
          role="grid"
          aria-label="${htmlEscape(getMonthName(this._viewDate, this._locale))} ${this._viewDate.getFullYear()}"
        >
          <div role="row" style="display:contents">${colHeaders}</div>
          ${rows}
        </div>
      </div>
    `;
  }

  _renderMonthView() {
    const todayDate = today();
    const selectedYear = this._valueDate?.getFullYear();
    const selectedMonth = this._valueDate?.getMonth();

    // Group 12 months into 3 rows of 4 for ARIA grid semantics.
    const rows = Array.from({ length: 3 }, (_, rowIndex) => {
      const cells = Array.from({ length: MONTH_VIEW_COLUMNS }, (_, colIndex) => {
        const monthIndex = rowIndex * MONTH_VIEW_COLUMNS + colIndex;
        const monthDate = createDate(this._viewDate.getFullYear(), monthIndex, 1);
        const selected = selectedYear === monthDate.getFullYear() && selectedMonth === monthIndex;
        const focused = this._focusedDate.getFullYear() === monthDate.getFullYear() && this._focusedDate.getMonth() === monthIndex;
        const currentMonth = todayDate.getFullYear() === monthDate.getFullYear() && todayDate.getMonth() === monthIndex;
        const disabled = !monthIntersectsRange(monthDate, this._minDate, this._maxDate);

        return `
          <button
            role="gridcell"
            type="button"
            class="picker__cell${selected ? ' is-selected' : ''}${currentMonth ? ' is-today' : ''}"
            data-month="${monthIndex}"
            data-focused="${focused}"
            aria-selected="${selected}"
            ${currentMonth ? 'aria-current="true"' : ''}
            aria-label="${htmlEscape(getMonthName(monthDate, this._locale))} ${monthDate.getFullYear()}"
            ${disabled ? 'disabled' : ''}
            tabindex="${focused ? '0' : '-1'}"
          >
            <span aria-hidden="true">${getMonthName(monthDate, this._locale, 'short')}</span>
          </button>
        `;
      }).join('');

      return `<div role="row" style="display:contents">${cells}</div>`;
    }).join('');

    return `
      <div class="picker__body" data-view="month">
        ${this._renderHeader()}
        <div class="picker__grid picker__grid--months" role="grid" aria-label="${this._viewDate.getFullYear()} months">
          ${rows}
        </div>
      </div>
    `;
  }

  _renderYearView() {
    const startYear = this._getYearRangeStart();
    const todayYear = today().getFullYear();
    const selectedYear = this._valueDate?.getFullYear();

    // Group 10 years into 2 rows of 5 for ARIA grid semantics.
    const rows = Array.from({ length: 2 }, (_, rowIndex) => {
      const cells = Array.from({ length: YEAR_VIEW_COLUMNS }, (_, colIndex) => {
        const index = rowIndex * YEAR_VIEW_COLUMNS + colIndex;
        const year = startYear + index;
        const selected = selectedYear === year;
        const focused = this._focusedDate.getFullYear() === year;
        const currentYear = todayYear === year;
        const disabled = !yearIntersectsRange(year, this._minDate, this._maxDate);

        return `
          <button
            role="gridcell"
            type="button"
            class="picker__cell${selected ? ' is-selected' : ''}${currentYear ? ' is-today' : ''}"
            data-year="${year}"
            data-focused="${focused}"
            aria-selected="${selected}"
            ${currentYear ? 'aria-current="true"' : ''}
            aria-label="${year}"
            ${disabled ? 'disabled' : ''}
            tabindex="${focused ? '0' : '-1'}"
          >
            <span aria-hidden="true">${year}</span>
          </button>
        `;
      }).join('');

      return `<div role="row" style="display:contents">${cells}</div>`;
    }).join('');

    return `
      <div class="picker__body" data-view="year">
        ${this._renderHeader()}
        <div class="picker__grid picker__grid--years" role="grid" aria-label="Select year">
          ${rows}
        </div>
      </div>
    `;
  }

  render() {
    this._ensureRoot();

    const rawLabel = this.getAttribute('label') || 'Choose a date';
    const rawPlaceholder = this.getAttribute('placeholder') || 'Select a date';
    const label = htmlEscape(rawLabel);
    const displayValue = this._valueDate
      ? getCachedFormatter(this._locale, { month: 'long', day: 'numeric', year: 'numeric' }).format(this._valueDate)
      : htmlEscape(rawPlaceholder);
    const helperText = this._valueDate ? formatDateString(this._valueDate) : 'No date selected';
    // Combine label + current value so AT announces both on focus.
    const triggerAccessibleName = this._valueDate
      ? `${label}: ${htmlEscape(displayValue)}`
      : label;
    const viewMarkup = this._view === 'day' ? this._renderDayView() : this._view === 'month' ? this._renderMonthView() : this._renderYearView();
    const todayDisabled = !isWithinRange(today(), this._minDate, this._maxDate);

    this._rootElement.innerHTML = `
      <div class="picker" data-open="${this._open}" data-view="${this._view}">
        <button
          type="button"
          class="picker__trigger"
          data-action="toggle"
          aria-expanded="${this._open}"
          aria-controls="${this._panelId}"
          aria-haspopup="dialog"
          aria-label="${triggerAccessibleName}"
        >
          <span class="picker__trigger-copy">
            <span class="picker__trigger-label">${displayValue}</span>
            <span class="picker__trigger-meta">${htmlEscape(helperText)}</span>
          </span>
          <span class="picker__trigger-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3.5" y="5.5" width="17" height="15" rx="2"></rect>
              <path d="M7.5 3.5v4M16.5 3.5v4M3.5 9.5h17"></path>
            </svg>
          </span>
        </button>
        <div
          id="${this._panelId}"
          class="picker__panel"
          role="dialog"
          aria-label="${label}"
          aria-modal="true"
          aria-hidden="${!this._open}"
        >
          ${viewMarkup}
          <div class="picker__footer">
            <button type="button" class="picker__footer-action" data-action="today" ${todayDisabled ? 'disabled' : ''}>Today</button>
            <button type="button" class="picker__footer-action" data-action="clear" ${this._valueDate ? '' : 'disabled'}>Clear</button>
          </div>
        </div>
      </div>
    `;
  }

  _ensureRoot() {
    if (this._rootElement) {
      return;
    }

    this.shadowRoot.innerHTML = `
      <link rel="stylesheet" href="${this._styleHref}">
      <div data-root></div>
    `;
    this._rootElement = this.shadowRoot.querySelector('[data-root]');
  }
}

if (!customElements.get('date-picker')) {
  customElements.define('date-picker', DatePicker);
}
