// Short initials shown in place of school logos (we don't display logos without permission).
// Works from the raw English name so acronyms like "NIST" or "RBIS" survive title-casing.

const STOP_WORDS = /^(of|the|and|at|de|la|le|du|des|for)$/i;
const INSTITUTION_WORD = /^(schools?|kinderg\w*|preschool|college|academy|centre|center)$/i;
const MAX_LETTERS = 4;

export function schoolInitials(rawName: string | null | undefined): string {
  const name = (rawName ?? "").trim();
  if (!/[A-Za-z]/.test(name)) return thaiInitial(name);

  // "International School Bangkok (ISB)"
  const bracketed = name.match(/\(([A-Z]{2,5})\)/);
  if (bracketed) return bracketed[1];

  // "Q.S.I. International School"
  const dotted = name.match(/^((?:[A-Z]\.){2,})/);
  if (dotted) return dotted[1].replace(/\./g, "");

  const leading = leadingAcronym(name);
  if (leading) return leading;

  const tokens = name
    .replace(/\([^)]*\)/g, " ")
    .replace(/['’]/g, "")
    .replace(/pre\s*-\s*school/gi, "Preschool")
    .split(/[\s.,:;\-–/&]+/)
    .map((w) => w.replace(/[^A-Za-z]/g, ""))
    .filter(Boolean);

  // Drop trailing campus/location words: keep up to the last "School"/"Kindergarten"/...,
  // plus "of <Place>" right after it ("Singapore International School of Bangkok" -> SISB).
  let end = tokens.length;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (INSTITUTION_WORD.test(tokens[i])) {
      end = i + 1;
      break;
    }
  }
  if (end < tokens.length - 1 && /^of$/i.test(tokens[end])) end += 2;

  let words = tokens
    .slice(0, end)
    // "Kindergarten School" counts once
    .filter((w, i, arr) => !(INSTITUTION_WORD.test(w) && i > 0 && INSTITUTION_WORD.test(arr[i - 1])))
    .filter((w) => !STOP_WORDS.test(w));
  // "International School Eastern Seaboard": nothing distinctive before the cut, so keep the place
  if (words.every((w) => INSTITUTION_WORD.test(w) || /^inte/i.test(w))) {
    words = tokens.filter((w) => !STOP_WORDS.test(w));
  }

  const letters = words.map((w) => w[0].toUpperCase()).join("");
  if (letters.length >= 2) return letters.slice(0, MAX_LETTERS);
  return (words[0] ?? tokens[0] ?? "").slice(0, 2).toUpperCase() || "?";
}

// "NIST International School", "RBIS INTERNATIONAL SCHOOL", "D-PREP International School"
function leadingAcronym(name: string): string | null {
  const [first = "", next = ""] = name.split(/\s+/);
  const letters = first.replace(/[^A-Za-z]/g, "");
  if (!/^[A-Z]{2,5}$/.test(letters) || STOP_WORDS.test(letters)) return null;

  if (name !== name.toUpperCase()) return letters;

  // In an all-caps name every word looks like an acronym, so only trust short,
  // vowel-poor words right before INTERNATIONAL/BRITISH (RBIS, KIS, BSB — not THAI or SIAM).
  const vowels = (letters.match(/[AEIOU]/g) ?? []).length;
  if (letters.length <= 4 && vowels <= 1 && /^(INTERNATIONAL|BRITISH)$/.test(next)) return letters;
  return null;
}

function thaiInitial(name: string): string {
  const consonant = name.replace(/^โรงเรียน/, "").match(/[ก-ฮ]/);
  return consonant ? consonant[0] : "?";
}
