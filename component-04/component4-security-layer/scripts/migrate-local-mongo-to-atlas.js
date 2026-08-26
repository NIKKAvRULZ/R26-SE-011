'use strict';

require('dotenv').config({ path: require('node:path').resolve(__dirname, '..', 'backend', '.env') });
const { MongoClient } = require('../backend/node_modules/mongodb');
const { prepareMongoConnection } = require('../backend/src/mongo-connection');

const LOCAL_URI = process.env.MONGODB_LOCAL_MIGRATION_URI || 'mongodb://127.0.0.1:27017/ZKP_Login';
const COLLECTIONS = [
  ['component4companies', 'companyId'],
  ['component4users', 'userId'],
  ['component4institutions', 'institutionId'],
  ['component4sessions', 'jti'],
  ['component4audits', '_id'],
  ['component4verificationattempts', '_id'],
];

async function main() {
  if (!process.env.MONGODB_URI?.startsWith('mongodb+srv://')) throw new Error('MONGODB_URI must point to Atlas');
  const destination = await prepareMongoConnection(process.env.MONGODB_URI);
  const local = new MongoClient(LOCAL_URI);
  const atlas = new MongoClient(destination.uri, destination.options);
  await Promise.all([local.connect(), atlas.connect()]);

  try {
    for (const [name, key] of COLLECTIONS) {
      const documents = await local.db().collection(name).find({}).toArray();
      if (documents.length) {
        await atlas.db().collection(name).bulkWrite(documents.map((document) => ({
          replaceOne: { filter: { [key]: document[key] }, replacement: document, upsert: true },
        })));
      }
      console.log(`${name}: local=${documents.length}, atlas=${await atlas.db().collection(name).countDocuments()}`);
    }
  } finally {
    await Promise.all([local.close(), atlas.close()]);
  }
}

main().catch((error) => {
  console.error(`Migration failed: ${error.message}`);
  process.exitCode = 1;
});
