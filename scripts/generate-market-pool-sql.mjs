import fs from "node:fs";
import path from "node:path";

const REGIONS = [
  { key: "europe", nats: ["GER", "FRA", "ENG", "ITA", "ESP", "NED", "POR", "CRO", "BEL", "SWE", "AUT", "SUI", "POL", "CZE"] },
  { key: "africa", nats: ["NGA", "GHA", "SEN", "MAR", "CIV", "CMR", "EGY", "RSA", "ALG", "TUN", "KEN", "UGA", "ZAM", "MLI"] },
  { key: "asia", nats: ["JPN", "KOR", "IRN", "SAU", "QAT", "CHN", "THA", "IND", "UAE", "IDN", "VIE", "IRQ", "UZB", "AUS"] },
  { key: "north_america", nats: ["USA", "MEX", "CAN", "CRC", "JAM", "PAN", "HON", "SLV", "GTM", "HTI", "CUB", "TRI", "DOM", "NIC"] },
  { key: "south_america", nats: ["ARG", "BRA", "URU", "CHI", "COL", "PER", "ECU", "PAR", "BOL", "VEN", "GUY", "SUR", "PAN", "CRC"] },
  { key: "oceania", nats: ["AUS", "NZL", "FIJ", "PNG", "NCL", "TAH", "SOL", "VAN", "SAM", "TON", "COK", "NIU", "TUV", "KIR"] },
];

// Male first names common in international football (no titles, no non-name words).
const FIRST = [
  "Marco", "Luca", "Jonas", "Felix", "Timo", "Kai", "Leon", "Noah", "Matteo", "Lorenzo",
  "Thiago", "Bruno", "Pedro", "Diego", "Carlos", "Miguel", "Antoine", "Hugo", "Lucas", "Raphael",
  "Nicolò", "Federico", "Gianluca", "Davide", "Alessandro", "Francesco", "Andrea", "Simone", "Stefano", "Gabriel",
  "Martin", "Jan", "Tomas", "Piotr", "Arkadiusz", "Nikola", "Ivan", "Luka", "Marko", "Dusan",
  "Victor", "Samuel", "Emmanuel", "Youssef", "Amadou", "Kalidou", "Riyad", "Hakim", "Achraf", "Sofiane",
  "Takumi", "Daichi", "Takefusa", "Hwang", "Min-jae", "Kaoru", "Junya", "Wataru", "Ritsu", "Ao",
  "Christian", "Tyler", "Giovanni", "Sergio", "Julian", "Florian", "Joshua", "Jamal", "Leroy", "Nico",
  "Robert", "Thomas", "Manuel", "Maximilian", "Philipp", "Luis", "Pablo", "Jorge", "Andres", "Rodrigo",
  "Enzo", "Warren", "Desire", "Nicolas", "Alexis", "Benjamin", "Jonathan", "Sebastian", "Daniel", "David",
  "Cristiano", "Lionel", "Kylian", "Erling", "Harry", "Mohamed", "Min-jae", "Bukayo", "Jude", "Phil",
];

// Football surnames — combined with a different first name for subtle mashup humor.
const LAST = [
  "Pulisic", "Sané", "Haaland", "Mbappé", "Musiala", "Bellingham", "Yamal", "Gavi", "Pedri", "Saka",
  "Foden", "Rashford", "Osimhen", "Son", "van Dijk", "Alvarez", "Martínez", "Griezmann", "Müller", "Kane",
  "Salah", "Beckham", "Ibrahimović", "Modrić", "Buffon", "Maldini", "Zidane", "Henry", "Kroos", "Ramos",
  "Alaba", "Davies", "Hakimi", "Cancelo", "Walker", "Stones", "Dias", "Ederson", "Alisson", "Courtois",
  "Neuer", "Donnarumma", "Maignan", "Lewandowski", "Benzema", "Suárez", "Dybala", "Vidal", "Pogba", "Kanté",
  "Rodri", "De Bruyne", "Silva", "Gündogan", "Özil", "Reus", "Aubameyang", "Giroud", "Coman", "Gnabry",
  "Chiesa", "Leao", "Raphinha", "Vinícius", "Antony", "Mount", "Rice", "Palmer", "Wirtz", "Olise",
  "Simons", "Guirassy", "Lookman", "Valverde", "Camavinga", "Tchouaméni", "Dembele", "Koundé", "Araujo", "Christensen",
  "Tomori", "Calafiori", "Timber", "Saliba", "White", "Robertson", "Alexander-Arnold", "Gravenberch", "Szoboszlai", "Kimmich",
];

const STAR_TEMPLATES = [
  ...Array(23).fill("1"),
  ...Array(19).fill("2"),
  ...Array(26).fill("3"),
  ...Array(16).fill("4"),
  ...Array(5).fill("5"),
  ...Array(1).fill("6"),
];

const POS_WEIGHTS = [
  ...Array(38).fill("ATT"),
  ...Array(24).fill("DEF"),
  ...Array(18).fill("MID"),
  ...Array(10).fill("UTIL"),
];

const AGE_WEIGHTS = [
  ...Array(49).fill("prime"),
  ...Array(31).fill("talent"),
  ...Array(10).fill("veteran"),
];

const CHEM_WEIGHTS = [
  ...Array(39).fill("none"),
  ...Array(26).fill("left"),
  ...Array(23).fill("right"),
  ...Array(12).fill("both"),
];

const ROLES = {
  ATT: ["Stürmer", "Pressing-Stürmer", "Inverser Flügelspieler", "Mittelstürmer", "Außenstürmer"],
  DEF: ["Innenverteidiger", "Außenverteidiger", "Libero", "Manndecker", "Spielaufbauer"],
  MID: ["Zentrales Mittelfeld", "Offensiver Mittelfeldspieler", "Defensiver Mittelfeldspieler", "Box-to-Box"],
  UTIL: ["Vielseitiger Spieler", "Vielseitiger Kaderspieler", "Flexibler Rollenspieler"],
};

const ARCH = ["alpha", "beta", "gamma"];

// Skip exact matches of well-known real players (mashups should stay fictional).
const REAL_PLAYER_NAMES = new Set([
  "Lionel Messi", "Cristiano Ronaldo", "Kylian Mbappé", "Erling Haaland", "Harry Kane",
  "Mohamed Salah", "Robert Lewandowski", "Kevin De Bruyne", "Luka Modrić", "Manuel Neuer",
  "Thomas Müller", "Joshua Kimmich", "Jamal Musiala", "Bukayo Saka", "Phil Foden",
  "Jude Bellingham", "Pedri González", "Gavi Paez", "Lamine Yamal", "Heung-min Son",
]);

function pick(arr, i) {
  return arr[i % arr.length];
}

function shuffle(arr, seed = 42) {
  const result = [...arr];
  let state = seed;

  for (let i = result.length - 1; i > 0; i -= 1) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    const j = state % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function slug(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function buildProfile(stars, ageGroup, pos, index) {
  const base = Number(stars);
  let skillMax = base;
  let trainable = false;
  let gap = 0;
  let vetFallback = null;

  const priceTable = {
    1: [7_000_000, 12_000_000],
    2: [15_000_000, 30_000_000],
    3: [15_000_000, 30_000_000],
    4: [20_000_000, 40_000_000],
    5: [25_000_000, 50_000_000],
    6: [30_000_000, 60_000_000],
  };

  const [scout, bid] = priceTable[base];

  if (ageGroup === "talent" && base <= 2) {
    trainable = true;
    gap = base === 2 ? 3 + (index % 2) : 1;
    skillMax = Math.min(6, base + gap + (base === 2 ? 1 : 0));
  } else if (ageGroup === "prime" && base <= 2) {
    trainable = true;
    gap = Math.max(1, 3 - base);
    skillMax = Math.min(6, base + gap);
  } else if (ageGroup === "veteran") {
    trainable = false;
    gap = 0;
    skillMax = base;
    vetFallback = String(Math.max(1, base - 1));
  } else if (base === 4 && ageGroup === "prime" && index % 2 === 0) {
    trainable = true;
    gap = 1;
    skillMax = Math.min(6, base + gap);
  } else {
    trainable = false;
    gap = 0;
    skillMax = base;
  }

  const age =
    ageGroup === "talent"
      ? 17 + (index % 3)
      : ageGroup === "veteran"
        ? 32 + (base % 6)
        : 23 + (base % 8);

  const position = pos === "UTIL" ? "UTIL" : pos;
  const eligible =
    pos === "UTIL"
      ? "{DEF,MID,ATT}"
      : pos === "DEF"
        ? "{DEF}"
        : pos === "MID"
          ? base <= 2
            ? "{MID,ATT}"
            : "{MID}"
          : "{ATT}";

  let attArch = null;
  let defArch = null;

  if (pos !== "UTIL") {
    if (pos === "ATT" || (pos === "MID" && eligible.includes("ATT"))) {
      attArch = pick(ARCH, base + ageGroup.length + index);
    }
    if (pos === "DEF") {
      defArch = pick(ARCH, base + index);
    }
  }

  return {
    age,
    attArch,
    base,
    bid,
    defArch,
    eligible,
    gap,
    position,
    scout,
    skillMax,
    trainable,
    vetFallback,
  };
}

function chemFlags(chemistry) {
  return {
    chemistry,
    left: chemistry === "left" || chemistry === "both",
    right: chemistry === "right" || chemistry === "both",
  };
}

function sqlStr(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlJson(value) {
  return sqlStr(JSON.stringify(value));
}

const starsShuffled = shuffle(STAR_TEMPLATES);
const posShuffled = shuffle(POS_WEIGHTS);
const ageShuffled = shuffle(AGE_WEIGHTS);
const chemShuffled = shuffle(CHEM_WEIGHTS);

const usedNames = new Set();
const players = [];
let idx = 0;

for (const region of REGIONS) {
  for (let i = 0; i < 15; i += 1) {
    let displayName = "";
    let attempt = 0;

    while (!displayName || usedNames.has(displayName) || REAL_PLAYER_NAMES.has(displayName)) {
      const mix = idx * 17 + attempt * 31 + i * 11 + region.key.length;
      const first = FIRST[mix % FIRST.length];
      const last = LAST[(mix * 3 + 7) % LAST.length];
      attempt += 1;
      displayName = `${first} ${last}`;
    }

    usedNames.add(displayName);

    const stars = starsShuffled[idx];
    let ageGroup = ageShuffled[idx];
    const pos = posShuffled[idx];

    if (ageGroup === "talent" && Number(stars) >= 4) {
      ageGroup = "prime";
    } else if (ageGroup === "veteran" && Number(stars) <= 2) {
      ageGroup = "prime";
    } else if (ageGroup === "veteran" && Number(stars) === 1) {
      ageGroup = "prime";
    }
    const chem = chemShuffled[idx];
    const nat = region.nats[i % region.nats.length];
    const profile = buildProfile(stars, ageGroup, pos, idx);
    const roleKey = pos === "UTIL" ? "UTIL" : pos;

    players.push({
      ageGroup,
      chem,
      displayName,
      key: `market-pool-${region.key}-${String(i + 1).padStart(2, "0")}_${slug(displayName)}`,
      nat,
      pos,
      region: region.key,
      role: pick(ROLES[roleKey], idx),
      stars,
      ...profile,
    });

    idx += 1;
  }
}

const lines = players.map((player) => {
  const chem = chemFlags(player.chem);
  const metadata = {
    generated: true,
    potential_gap: player.gap,
    seed_version: "market_pool_expand_v3_realistic_names",
    source_distribution: "market_pool_football_mashup_names",
    trainable: player.trainable,
  };

  const attArch = player.attArch ? sqlStr(player.attArch) : "null";
  const defArch = player.defArch ? sqlStr(player.defArch) : "null";
  const vetFallback = player.vetFallback ? `${player.vetFallback}.0` : "null";

  return `  (${sqlStr(player.key)}, ${sqlStr(player.displayName)}, ${sqlStr(player.position)}, ${attArch}, ${defArch}, ${sqlStr(player.role)}, ${sqlStr(player.nat)}, ${player.age}, ${sqlStr(player.ageGroup)}, ${sqlStr(player.eligible)}::public.player_position[], ${player.base}.0, 0.0, ${player.skillMax}.0, ${vetFallback}, ${sqlStr(chem.chemistry)}, ${chem.left}, ${chem.right}, 'star', ${player.scout}, ${player.bid}, ${sqlStr(player.region)}, ${sqlJson(metadata)}, 'public')`;
});

const sql = `-- Market pool expansion (${players.length} players, 15 per scouting region).
-- Realistic male football-style mashup names; strength distribution aligned with public catalog.
-- Safe to run multiple times.

insert into public.players (
  content_key,
  display_name,
  position,
  attacker_archetype,
  defender_archetype,
  role,
  nationality,
  age,
  age_group,
  eligible_positions,
  base_stars,
  potential_stars,
  skill_max,
  veteran_fallback,
  chemistry,
  chemistry_left,
  chemistry_right,
  chemistry_symbol,
  scouting_price,
  minimum_bid,
  region,
  metadata,
  visibility
) values
${lines.join(",\n")}
on conflict (content_key) do nothing;
`;

const outputPath = path.join("supabase", "market_player_pool_expand.sql");
fs.writeFileSync(outputPath, sql);

console.log(`Wrote ${players.length} players to ${outputPath}`);
console.log("Stars", players.reduce((acc, player) => {
  acc[player.base] = (acc[player.base] ?? 0) + 1;
  return acc;
}, {}));
console.log("Sample names", players.slice(0, 10).map((player) => player.displayName));
