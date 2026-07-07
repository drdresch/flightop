# Flight Ops Dashboard ✈️

A Netlify-ready live aircraft dashboard for a third monitor.

This is not Flightradar24. It is a FlightRadar-style personal dashboard using open ADS-B data.

## What it does

- Shows aircraft near Portland, Oregon by default.
- Uses a full-screen dark map.
- Shows aircraft callsigns, altitude, speed, heading, squawk, and type when available.
- Lets you search and sort aircraft.
- Refreshes every 15 seconds.
- Uses a Netlify Function as a clean API proxy.
- Works well on a third monitor.

## Data source

The app uses the adsb.fi open data endpoint:

`/api/v3/lat/[lat]/lon/[lon]/dist/[dist]`

Please keep the adsb.fi credit visible in the app. Their open data terms say it is for personal, non-commercial use and that attribution is required.

## Local setup

Install Node.js first.

Then run:

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

Important: local Vite dev mode may not run Netlify Functions by itself. For the full Netlify setup, install Netlify CLI:

```bash
npm install -g netlify-cli
netlify dev
```

Then open:

```text
http://localhost:8888
```

## Deploy to Netlify

### Easiest path

1. Make a new GitHub repo.
2. Upload these files.
3. Go to Netlify.
4. New site from Git.
5. Pick the repo.
6. Build command:

```bash
npm run build
```

7. Publish directory:

```text
dist
```

8. Functions directory:

```text
netlify/functions
```

Netlify should also read `netlify.toml` automatically.

## Put it on monitor 3

1. Open the deployed Netlify URL.
2. Drag the browser window to monitor 3.
3. Press fullscreen:
   - Mac: Control + Command + F
   - Windows: F11

## Change the default location

Open:

```text
src/App.jsx
```

Change this block:

```js
const DEFAULT_CENTER = {
  lat: 45.5898,
  lon: -122.5951,
};
```

That is currently Portland International Airport.

## Known limits

- Route info like PDX to JFK is not guaranteed. ADS-B data usually gives position, altitude, speed, heading, and callsign.
- Aircraft type and registration appear only when available.
- This is for personal display use, not resale, public commercial screens, or republishing the data.
- Some aircraft may be missing because ADS-B coverage depends on receivers.

## Next upgrades

Good v2 ideas:

- Airport mode for PDX arrivals and departures.
- Favorite callsigns, like ASA18.
- METAR weather card.
- LiveATC quick links.
- Local ADS-B receiver mode with a Raspberry Pi and antenna.
- Route lookup using a paid aviation API.
