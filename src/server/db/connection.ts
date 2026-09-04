import { MongoClient, type Db } from 'mongodb';

let client: MongoClient | null = null;
let db: Db | null = null;

// UAT root cause (proven via real monday logs, not guessed): monday Code's
// managed Document DB provisions a version-scoped database and namespaces
// any explicitly-requested db name onto its own prefix with "#" — passing
// our own name ('ariavel_sourcing') here produced the literal Mongo error
// `Invalid database name: <monday-provisioned-prefix>#ariavel_sourcing`
// on every single collection operation. `client.db()` with no argument
// uses the database the connection string itself already specifies —
// monday's own provisioned name — avoiding that namespacing entirely.
export async function getDb(): Promise<Db> {
  if (db) return db;

  const uri = process.env['MNDY_MONGODB_CONNECTION_STRING'];
  if (!uri) throw new Error('MNDY_MONGODB_CONNECTION_STRING is not set');

  client = new MongoClient(uri);
  await client.connect();
  db = client.db();
  return db;
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
