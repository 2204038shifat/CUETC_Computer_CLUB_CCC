const mongoose = require('mongoose');
const dotenv = require('dotenv');
const EventRegistration = require('./models/EventRegistration');
const ContestRegistration = require('./models/ContestRegistration');

dotenv.config();

async function migrate() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected');

        // Migrate EventRegistrations
        let evtResult = await EventRegistration.updateMany(
            { paymentStatus: 'completed' },
            { $set: { paymentStatus: 'confirmed' } },
            { strict: false }
        );
        console.log('Event paymentStatus completed -> confirmed:', evtResult.modifiedCount);

        let evtResult2 = await EventRegistration.updateMany(
            { registrationStatus: 'registered' },
            { $set: { registrationStatus: 'confirmed' } },
            { strict: false }
        );
        console.log('Event registrationStatus registered -> confirmed:', evtResult2.modifiedCount);

        // Migrate ContestRegistrations
        let cntResult = await ContestRegistration.updateMany(
            { paymentStatus: 'completed' },
            { $set: { paymentStatus: 'confirmed' } },
            { strict: false }
        );
        console.log('Contest paymentStatus completed -> confirmed:', cntResult.modifiedCount);

        let cntResult2 = await ContestRegistration.updateMany(
            { registrationStatus: 'registered' },
            { $set: { registrationStatus: 'confirmed' } },
            { strict: false }
        );
        console.log('Contest registrationStatus registered -> confirmed:', cntResult2.modifiedCount);

        console.log('Migration completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
