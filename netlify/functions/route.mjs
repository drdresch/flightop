// ADS-B aircraft positions do not include a trustworthy origin or destination.
// The previous fallback queried a callsign database, but callsigns are reused and
// the returned route can belong to a different flight. A missing route is better
// than confidently displaying the wrong destination.
export default async function handler() {
  return new Response(
    JSON.stringify({
      ok: true,
      found: false,
      confidence: "Route unavailable",
      reason: "No confirmed filed route is available from the live ADS-B feed.",
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    }
  );
}
