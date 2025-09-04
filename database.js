import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
if (!uri) {
    throw new Error('MONGODB_URI is not defined in your .env file.');
}

const client = new MongoClient(uri);

let db;
let contactsCollection;
let pinsCollection;
let remindersCollection;
let teamRemindersCollection;
let settingsCollection;

export async function connectDB() {
    try {
        await client.connect();
        db = client.db('whatsappbot'); // You can name your database here
        
        // Define your collections (like tables or JSON files)
        contactsCollection = db.collection('contacts');
        pinsCollection = db.collection('pins');
        remindersCollection = db.collection('reminders');
        teamRemindersCollection = db.collection('teamReminders');
        settingsCollection = db.collection('settings');

        console.log('✅ Connected to MongoDB');

    } catch (error) {
        console.error('❌ Failed to connect to MongoDB', error);
        process.exit(1);
    }
}

// Export the collections so other files can use them
export { contactsCollection, pinsCollection, remindersCollection, teamRemindersCollection, settingsCollection };