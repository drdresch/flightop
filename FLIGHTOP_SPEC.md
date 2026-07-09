# FlightOp Product Spec

## Core idea

FlightOp is not a FlightRadar24 clone.

FlightOp is a FlightWall-style aviation display for a third monitor, wall screen, or tablet.

The main experience is a passive LED-style wall display that rotates through aircraft in a selected area and shows useful, beautiful, readable flight information.

The map is for setup and investigation.  
The wall display is the product.

## Product modes

### 1. Wall Mode

Default desktop mode.

Shows one aircraft at a time.

Rotates every 8 seconds.

Looks like an LED matrix display.

No map by default.

No card-heavy dashboard.

Display should show:

- Operator or aircraft type
- Flight number or registration
- Aircraft type, such as Cessna 182, Boeing 737, Airbus A320
- Altitude
- Ground speed
- Heading
- Climb/descent/level
- Human-readable location, such as “12 NM northwest of PDX”
- Likely ATC frequency candidate
- LiveATC link

### 2. Radar Mode

Map-based mode for investigation.

Used to:

- Click aircraft
- Inspect traffic
- Choose monitored area
- Draw polygon areas later
- Set center point and radius

Radar Mode should not replace Wall Mode.

### 3. Trip Mode

Personal flight tracking mode.

Example:

“Donna Europe Flight”

Track by:

- Callsign
- Registration
- Flight number when available

Display should show where the tracked flight is in plain English.

Example:

“Donna is over Iceland at 34,000 ft.”

Never invent route, ETA, or passenger identity.

If route data is unavailable, say so and fall back to ADS-B position.

## Area selection

User can choose a monitored area.

Initial version:

- Center on PDX
- Radius options: 20, 40, 80, 120, 180, 250 NM

Future version:

- Draw polygon on map
- Save named areas
- Examples: PDX, Home, Europe, Tour Route

## Aircraft rotation

Wall Mode rotates aircraft every 8 seconds.

Controls:

- Pause
- Resume
- Next
- Previous

Scan modes:

- Closest / overhead
- Lowest altitude
- Highest altitude
- Fastest
- Airliners only
- Cargo only
- General aviation
- Helicopters
- Business jets
- Favorites

## Favorites

User can favorite aircraft by:

- Callsign
- Registration
- Hex code

Favorites should be easy to track and pin.

Favorite aircraft can override normal rotation.

## ATC Helper

ATC Helper suggests likely frequencies.

It must never claim certainty.

ADS-B does not contain the active ATC frequency.

ATC guesses should use:

- Aircraft position
- Altitude
- Heading
- Distance from selected airport or area
- Known sector candidates

Display wording:

Use “Likely ATC” or “ATC candidate.”

Do not use “Current frequency.”

For PDX area, include candidates for:

- PDX Tower
- Portland Approach / Departure
- Seattle Center
- Oakland Center for southbound flights

ATC Helper should include:

- Frequency candidates
- Confidence level
- Reason
- LiveATC link

Future feature:

- Auto-open or auto-switch LiveATC feed when confidence is high
- User must control audio because browser autoplay rules may block it

## Data sources

Current source:

- adsb.fi open ADS-B data through Netlify Function

Architecture should allow swapping providers later.

Future providers:

- ADS-B Exchange
- FlightAware AeroAPI
- OpenSky
- Personal ADS-B receiver
- dump1090/readsb local feed

Use one normalized aircraft interface internally.

## Normalized aircraft fields

Each aircraft should normalize to:

- hex
- callsign
- registration
- aircraft type code
- aircraft description
- operator
- latitude
- longitude
- altitude
- ground speed
- heading / track
- vertical rate
- squawk
- category
- distance from monitored center
- last seen time

## Design direction

Inspired by:

- FlightWall
- LED airport departure boards
- Airline operations centers
- Old dot-matrix signs
- Broadcast graphics

Use:

- Dark charcoal / black
- Mint green
- Soft white
- Amber accents
- Minimal red
- Pixel texture
- Large readable typography

Avoid:

- Generic cards
- Material UI look
- FlightRadar24 clone look
- Map-first interface
- Tiny unreadable dashboard widgets

## Truth rules

Never invent:

- Route
- ETA
- Passenger identity
- ATC frequency
- Airline info

When data is missing, say:

- “Route unavailable”
- “ETA unavailable”
- “Likely ATC”
- “Unknown operator”

## Engineering rules for Codex

Do not rebuild the app from scratch unless explicitly asked.

Preserve working Netlify deployment.

Preserve existing functions unless replacing them intentionally.

Make changes incrementally.

Prefer small commits.

After changes, verify:

- `npm run build` passes
- Netlify Function still works at `/api/aircraft`
- Wall Mode renders without black screen
- No uncaught console errors

## Current priority

Build FlightOp Wall Mode.

The display should feel like hardware, not a website.

The default screen should rotate aircraft in the PDX area and show one aircraft at a time.
