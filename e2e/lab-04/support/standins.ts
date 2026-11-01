import type { Session } from "./env";

// Readable stand-ins for the users a test creates, used only in screenshots (see `snap` in ui.ts).
// The real names are test labels ("Lab4 Conflict Requester") and the real e-mail addresses hold the
// run id, so they change between runs. Each test's users get stand-ins in the order they were
// created, per role, so the same test always shows the same people.

type Role = Session["role"];

const STAND_INS: Record<Role, string[]> = {
  IT_STAFF: ["Jordan Staff", "Riley Staff", "Taylor Staff"],
  REQUESTER: ["Casey Requester", "Avery Requester"],
  ADMINISTRATOR: ["Morgan Admin"],
};

const created = new Map<string, { name: string; email: string; role: Role }[]>();

/** Called by the `makeUser` fixture for every user it creates. */
export function recordUser(testId: string, user: { name: string; email: string; role: Role }) {
  const list = created.get(testId) ?? [];
  list.push(user);
  created.set(testId, list);
}

/** The real name and e-mail of each user the test created, with the stand-in for each. */
export function standInsFor(testId: string): { from: string; to: string }[] {
  const used: Record<Role, number> = { IT_STAFF: 0, REQUESTER: 0, ADMINISTRATOR: 0 };
  const pairs: { from: string; to: string }[] = [];
  for (const u of created.get(testId) ?? []) {
    const name = STAND_INS[u.role][used[u.role]++];
    if (!name) throw new Error(`No screenshot stand-in left for another ${u.role}; add one to STAND_INS`);
    pairs.push({ from: u.email, to: `${name.toLowerCase().replace(/ /g, ".")}@example.test` });
    pairs.push({ from: u.name, to: name });
  }
  // longest first, so a name that contains another is replaced whole
  return pairs.sort((a, b) => b.from.length - a.from.length);
}
