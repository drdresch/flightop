import { mkdir, writeFile } from "node:fs/promises";

const AIRLINE_LOGOS = {
  ASA: ["alaskaairlines"],
  UAL: ["unitedairlines"],
  DAL: ["delta"],
  SWA: ["southwestairlines"],
  NKS: ["spiritairlines"],
  FFT: ["frontierairlines"],
  ICE: ["icelandair"],
  KLM: ["klm"],
  BAW: ["britishairways"],
  CFG: ["condor"],
  AAY: ["allegiantair"],
  QXE: ["horizonair"],
  SKW: ["skywestairlines"],
  AAL: ["americanairlines"],
  ACA: ["aircanada"],
  FDX: ["fedex"],
  UPS: ["ups"],
  JBU: ["jetblue"],
};

await mkdir(new URL("../public/logos/", import.meta.url), { recursive: true });

let icons = {};
try {
  icons = await import("simple-icons");
} catch {
  console.log("Simple Icons is not installed. Using FlightOp fallbacks.");
}

const availableIcons = Object.values(icons).filter((icon) => icon?.slug && icon?.svg);
for (const [prefix, slugs] of Object.entries(AIRLINE_LOGOS)) {
  const icon = availableIcons.find((candidate) => slugs.includes(candidate.slug));
  if (!icon) {
    console.log(`Logo unavailable for ${prefix}. Using fallback.`);
    continue;
  }

  await writeFile(
    new URL(`../public/logos/${prefix.toLowerCase()}.svg`, import.meta.url),
    icon.svg,
    "utf8"
  );
  console.log(`Copied ${icon.title} logo to ${prefix.toLowerCase()}.svg`);
}
