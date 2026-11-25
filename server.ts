import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createHttpServer } = require('./server.js');
const port = Number(process.env.PORT) || 3000;

createHttpServer().listen(port, () => {
  console.log(`Herbier est prêt sur le port ${port}`);
});
