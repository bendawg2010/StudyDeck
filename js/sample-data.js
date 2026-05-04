/* ============================================================================
   StudyDeck — sample data (seeded once on first launch)
   ============================================================================ */
(function (global) {
  'use strict';

  const SAMPLES = [
    {
      title: 'AP Biology — Cell Components',
      description: 'Core organelles and their functions. The classic biology starter.',
      color: 'linear-gradient(135deg, #34C759, #30B0C7)',
      cards: [
        { term: 'Mitochondria', definition: 'Powerhouse of the cell — produces ATP via cellular respiration. Has its own DNA.' },
        { term: 'Nucleus', definition: 'Control center containing DNA; surrounded by a double membrane (nuclear envelope).' },
        { term: 'Ribosome', definition: 'Site of protein synthesis. Made of rRNA and proteins; can be free or bound to ER.' },
        { term: 'Endoplasmic Reticulum', definition: 'Network of membranes; rough ER (with ribosomes) makes proteins, smooth ER makes lipids.' },
        { term: 'Golgi Apparatus', definition: 'Modifies, sorts, and packages proteins and lipids for secretion or use within the cell.' },
        { term: 'Lysosome', definition: 'Contains digestive enzymes that break down waste, debris, and worn-out organelles.' },
        { term: 'Chloroplast', definition: 'Site of photosynthesis in plant cells. Contains chlorophyll and has its own DNA.' },
        { term: 'Cell Membrane', definition: 'Phospholipid bilayer that controls what enters and leaves the cell. Selectively permeable.' },
        { term: 'Cytoskeleton', definition: 'Network of protein fibers (microfilaments, microtubules, intermediate filaments) that gives the cell shape.' },
        { term: 'Vacuole', definition: 'Storage sac for water, nutrients, and waste. Plant cells have one large central vacuole.' }
      ]
    },
    {
      title: 'Spanish 101 — Common Verbs',
      description: 'High-frequency Spanish verbs in their infinitive form.',
      color: 'linear-gradient(135deg, #FF6B6B, #C147FF)',
      cards: [
        { term: 'to be (essence)', definition: 'ser' },
        { term: 'to be (state)', definition: 'estar' },
        { term: 'to have', definition: 'tener' },
        { term: 'to do / to make', definition: 'hacer' },
        { term: 'to go', definition: 'ir' },
        { term: 'to eat', definition: 'comer' },
        { term: 'to drink', definition: 'beber' },
        { term: 'to speak', definition: 'hablar' },
        { term: 'to live', definition: 'vivir' },
        { term: 'to learn', definition: 'aprender' },
        { term: 'to want', definition: 'querer' },
        { term: 'to be able to', definition: 'poder' }
      ]
    },
    {
      title: 'US State Capitals — West Coast',
      description: 'Capitals of the western US states. Easy wins for trivia night.',
      color: 'linear-gradient(135deg, #FFB454, #FF6B6B)',
      cards: [
        { term: 'California', definition: 'Sacramento' },
        { term: 'Oregon', definition: 'Salem' },
        { term: 'Washington', definition: 'Olympia' },
        { term: 'Nevada', definition: 'Carson City' },
        { term: 'Arizona', definition: 'Phoenix' },
        { term: 'Idaho', definition: 'Boise' },
        { term: 'Utah', definition: 'Salt Lake City' },
        { term: 'Alaska', definition: 'Juneau' }
      ]
    }
  ];

  async function seedIfEmpty() {
    const existing = await db.listSets();
    if (existing.length > 0) return false;
    for (const sample of SAMPLES) {
      const id = await db.createSet({
        title: sample.title,
        description: sample.description,
        color: sample.color
      });
      await db.upsertCards(id, sample.cards.map(function (c, i) {
        return { term: c.term, definition: c.definition, position: i };
      }));
    }
    return true;
  }

  global.sampleData = { samples: SAMPLES, seedIfEmpty: seedIfEmpty };
})(window);
