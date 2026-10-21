// Downloads, for every company in the universe, into data-raw/ma/ (gitignored), from data.sec.gov only:
//   <T>.json              SEC XBRL company facts
//   <T>.submissions.json  SEC submissions index (SIC code, exchange, filing list)
// Requests are spaced well under the SEC's limit of 10 per second and identify the project in the User-Agent.
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { UNIVERSE } from "./universe.mjs";

const UA = process.env.SEC_USER_AGENT ?? "lindgreendavid.com portfolio research (non-commercial)";
const refresh = process.argv.includes("--refresh");
mkdirSync("data-raw/ma", { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  await sleep(350);
  return res.text();
}
for (const [ticker, cik] of UNIVERSE) {
  const pad = String(cik).padStart(10, "0");
  const f = `data-raw/ma/${ticker}.json`;
  const s = `data-raw/ma/${ticker}.submissions.json`;
  if (refresh || !existsSync(f)) writeFileSync(f, await get(`https://data.sec.gov/api/xbrl/companyfacts/CIK${pad}.json`));
  if (refresh || !existsSync(s)) {
    writeFileSync(s, await get(`https://data.sec.gov/submissions/CIK${pad}.json`));
    console.log("fetched submissions", ticker);
  }
}
