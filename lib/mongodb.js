import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME || 'nexos_school';

if (!uri) throw new Error('MONGO_URL não configurada');

let client;
let clientPromise;

if (!global._nexosMongoClientPromise) {
  client = new MongoClient(uri, {});
  global._nexosMongoClientPromise = client.connect();
}
clientPromise = global._nexosMongoClientPromise;

export async function getDb() {
  const c = await clientPromise;
  return c.db(dbName);
}

export default clientPromise;
