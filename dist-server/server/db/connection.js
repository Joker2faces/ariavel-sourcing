import { MongoClient } from 'mongodb';
let client = null;
let db = null;
const DB_NAME = 'ariavel_sourcing';
export async function getDb() {
    if (db)
        return db;
    const uri = process.env['MNDY_MONGODB_CONNECTION_STRING'];
    if (!uri)
        throw new Error('MNDY_MONGODB_CONNECTION_STRING is not set');
    client = new MongoClient(uri);
    await client.connect();
    db = client.db(DB_NAME);
    return db;
}
export async function closeDb() {
    if (client) {
        await client.close();
        client = null;
        db = null;
    }
}
