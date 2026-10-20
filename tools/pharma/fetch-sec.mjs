// Downloads SEC XBRL "company facts" for the selected companies into data/pharma/raw (not committed).
// The SEC asks automated clients to identify themselves. Set SEC_USER_AGENT to "Your Name contact@example.com" if you re-run this.
import fs from "node:fs";
import path from "node:path";
import { COMPANIES } from "./companies.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const out = path.join(root, "data/pharma/raw");
fs.mkdirSync(out, { recursive: true });
const UA = process.env.SEC_USER_AGENT ?? "lindgreendavid.com portfolio research (non-commercial)";

for (const [id, c] of Object.entries(COMPANIES)) {
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${c.cik}.json`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status} for ${url}`);
  const json = await res.text();
  fs.writeFileSync(path.join(out, `raw-${id}.json`), json);
  console.log(`${id}: ${json.length} bytes, retrieved ${new Date().toISOString()}`);
  await new Promise((r) => setTimeout(r, 500)); // stay well under the SEC rate limit
}
