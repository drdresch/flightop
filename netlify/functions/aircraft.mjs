export default async function handler(request) {
  try {
    const url = "https://opendata.adsb.fi/api/v2/lat/45.5898/lon/-122.5951/dist/120";

    const res = await fetch(url, {
      headers: {
        "User-Agent": "flightop personal dashboard"
      }
    });

    const data = await res.json();

    return new Response(JSON.stringify({
      ok: true,
      aircraft: data.aircraft || [],
      fetchedAt: new Date().toISOString()
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      error: error.message,
      aircraft: []
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}
