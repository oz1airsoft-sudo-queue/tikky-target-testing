# tikky-target-testing

Simple web app for tracking control over multiple capture points by several teams. Works offline in the browser with no dependencies.

## Usage

Open `index.html` in any modern browser. Use the **Setup** panel to configure teams, capture points, and operator name or load one of the built‑in scenarios. Start the match and switch point owners as play progresses. All changes are logged with timestamps and can be downloaded as a `.txt` file via the *Download Log* button.

Match controls allow starting, pausing, resuming, ending, and resetting games. State is preserved in `localStorage` so reloading the page continues where you left off.

## Features

- Unlimited teams and capture points
- LocalStorage persistence and downloadable plain-text logs
- High-contrast mode for accessibility
- Keyboard shortcuts: Space to start/pause/resume, **E** to end, **L** to download the log

## Built-in Scenarios

Select a scenario in **Setup** to preconfigure teams and points:

- **Domination** – three points (A/B/C) and two teams
- **King of the Hill** – one point (Hilltop) and three teams
- **Five Flags** – five points (A–E) and two teams
