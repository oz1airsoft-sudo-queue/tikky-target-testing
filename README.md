# tikky-target-testing
# tikky-target-testing

Simple web app for tracking control over multiple capture points by several teams. Works offline in the browser with no dependencies.

## Features

- Global match timer with start, pause, and resume controls.
- Individual timers for each capture point and per-team time tracking.
- Default teams: RESISTANCE (purple) and MILITIA (gold).
- Per-team last capture timestamps shown in military and 12-hour time.
- Export logs as CSV or plain text and import logs from CSV.

## Usage

Open `index.html` in any modern browser. Use the **Setup** panel to configure teams, capture points, and operator name or load one of the built‑in scenarios. Start the match and switch point owners as play progresses. All changes are logged with timestamps and can be downloaded as a `.txt` file via the *Download Log* button.

CSV export/import buttons allow saving or loading the log in spreadsheet-friendly format.

Match controls allow starting, pausing, resuming, ending, and resetting games. State is preserved in `localStorage` so reloading the page continues where you left off.
