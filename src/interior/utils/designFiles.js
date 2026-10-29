// Shared by the Project Design tab and the customer share snapshot.
//
// A CAD drawing / final render is an ENTRY holding a list of versions (the
// newest is the current one; earlier ones are history). Entries saved before
// versions existed held one flat file — normEntry wraps that as v1.

export const stripExt = (name) => (name || "").replace(/\.[^.]+$/, "");

export const normEntry = (e) => ({
  ...e,
  title: e.title ?? (e.caption || stripExt(e.name)),
  versions: e.versions || [{ id: `${e.id}_v1`, name: e.name, url: e.url, size: e.size, addedAt: e.addedAt || 0, note: "" }],
});

export const currentVersion = (e) => {
  const { versions } = normEntry(e);
  return versions[versions.length - 1];
};

/** The latest FINALIZED mood board for a room, or null if never finalized. */
export const finalMoodBoard = (room) => {
  const v = room?.moodBoardVersions || [];
  return v.length ? v[v.length - 1] : null;
};

/** Only the fields a mood board item needs — what history/share snapshots keep. */
export const slimMoodItems = (items) =>
  (items || []).map(({ imageUrl, x, y, w, h, zIndex }) => ({ imageUrl, x, y, w, h, zIndex: zIndex || 1 }));
