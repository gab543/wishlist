const { migrateLegacyStore } = require('../server');

migrateLegacyStore().then((result) => {
  if (result.migrated) console.log(`Wishlist imported to Supabase (${result.items} article(s)).`);
  else console.log(result.reason);
}).catch((error) => {
  console.error(`Import failed: ${error.message}`);
  process.exitCode = 1;
});
