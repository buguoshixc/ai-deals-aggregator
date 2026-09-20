const fs = require('fs');
const path = require('path');
const { collectAitoolsFyi, collectFuturepedia, collectFuturetools } = require('./collectors/aitools');
const { collectLayer3Labs, collectBitDegree, collectAitoolsDirectoryNet, collectZapierFreeAI } = require('./collectors/new_sources');

const DEALS_FILE = path.join(__dirname, '..', 'deals.json');
const MAX_DEALS = 100;

function normalize(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

const sourcePriority = { 'aitools.fyi': 4, 'Futurepedia': 3, 'Futuretools': 2, 'Layer3Labs': 1, 'BitDegree': 1, 'AitoolsDirectory': 1, 'Zapier': 1 };

/**
 * Deduplicate by normalized name: keep the entry with richer data (description, higher source priority)
 */
function dedup(entries) {
  const best = new Map();
  for (const deal of entries) {
    const key = normalize(deal.title);
    const existing = best.get(key);
    if (!existing) {
      best.set(key, deal);
      continue;
    }
    const existingScore = (existing.description ? 2 : 0) + (sourcePriority[existing.source] || 0);
    const dealScore = (deal.description ? 2 : 0) + (sourcePriority[deal.source] || 0);
    if (dealScore > existingScore) {
      best.set(key, deal);
    }
  }
  return [...best.values()];
}

async function collectAll() {
  console.log('Starting deals collection...');

  const collectors = [
    { name: 'aitools.fyi', fn: collectAitoolsFyi },
    { name: 'Futurepedia', fn: collectFuturepedia },
    { name: 'Futuretools', fn: collectFuturetools },
    { name: 'Layer3Labs', fn: collectLayer3Labs },
    { name: 'BitDegree', fn: collectBitDegree },
    { name: 'AitoolsDirectory', fn: collectAitoolsDirectoryNet },
    { name: 'Zapier', fn: collectZapierFreeAI }
  ];

  const allDeals = [];

  for (const collector of collectors) {
    try {
      console.log(`Collecting from ${collector.name}...`);
      const deals = await collector.fn();
      console.log(`  Got ${deals.length} deals from ${collector.name}`);
      allDeals.push(...deals);
    } catch (error) {
      console.error(`  Failed to collect from ${collector.name}: ${error.message}`);
    }
  }

  // Load existing deals
  let existingDeals = [];
  try {
    existingDeals = JSON.parse(fs.readFileSync(DEALS_FILE, 'utf8'));
  } catch (error) {
    console.log('No existing deals file found, creating new one');
  }

  // Merge fresh + existing, dedup by name, keep richest, sort by date
  const merged = dedup([...allDeals, ...existingDeals])
    .slice(0, MAX_DEALS)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const newCount = merged.filter(m => !existingDeals.some(e =>
    normalize(m.title) === normalize(e.title)
  )).length;

  // Only write if there are changes
  if (JSON.stringify(merged) === JSON.stringify(existingDeals)) {
    console.log('No new deals found, skipping write');
    return;
  }

  fs.writeFileSync(DEALS_FILE, JSON.stringify(merged, null, 2));
  console.log(`\nWrote ${merged.length} deals to deals.json (${newCount} new)`);
}

collectAll().catch(error => {
  console.error('Collection failed:', error);
  process.exit(1);
});