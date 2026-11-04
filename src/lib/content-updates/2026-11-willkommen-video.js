// Inhalts-Update November 2026: Der Ort „Willkommen“ zeigt das Intro-Video
// (public/videos/paasleben-intro.mp4) statt des Video-Platzhalters.
//
// Gleiche Mechanik wie 2026-10-willkommen.js: reine Funktion ohne
// Firestore-Zugriff. Die Website wendet sie im Speicher an, bis der Editor sie
// beim nächsten Login nach Firestore schreibt (src/admin/migrations.js).
// Hat der Ort schon ein Video (im Editor eingetragen), bleibt es unangetastet.

export const ID = '2026-11-willkommen-video';

export const VIDEO_PATH = 'videos/paasleben-intro.mp4';

export const plan = (locations) => {
  const welcome = locations.find((loc) => loc.id === '01-willkommen')
    || locations.find((loc) => /^willkommen$/i.test(String(loc.title || '').trim()));
  if (!welcome || welcome.video) return { updates: {}, creates: {}, summary: [] };
  return {
    updates: {
      [welcome.id]: { video: VIDEO_PATH, videoPlaceholder: false, updatedAt: new Date().toISOString() },
    },
    creates: {},
    summary: ['„Willkommen“ zeigt das Intro-Video'],
  };
};
