import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load env variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const uri = process.env.MONGODB_URI || 'mongodb+srv://haldarainit_db_user:1Q4nQwMJI9ohOvce@cluster0.5uicr6o.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function run() {
  try {
    await mongoose.connect(uri);
    
    const Account = mongoose.models.Account || mongoose.model('Account', new mongoose.Schema({}, { strict: false }), 'accounts');
    const Organization = mongoose.models.Organization || mongoose.model('Organization', new mongoose.Schema({}, { strict: false }), 'organizations');
    
    // Get the organization named PikagEnergy or similar
    const orgs = await Organization.find({}).lean();
    console.log("Organizations in system:");
    orgs.forEach((o: any) => console.log(`- ID: ${o._id}, Name: ${o.name}`));
    
    for (const org of orgs) {
      console.log(`\n========================================`);
      console.log(`Org ID: ${org._id} | Name: ${org.name}`);
      console.log(`========================================`);
      const accounts = await Account.find({ organizationId: org._id, isDeleted: false }).lean();
      
      const fixedAssets = accounts.filter((a: any) => a.accountType === 'Fixed Asset');
      console.log(`Fixed Asset Accounts (${fixedAssets.length}):`);
      fixedAssets.forEach((a: any) => console.log(`  - Code: ${a.code} | Name: ${a.name} | Type: ${a.accountType}`));
      
      const payables = accounts.filter((a: any) => a.accountType === 'Accounts Payable');
      console.log(`Accounts Payable Accounts (${payables.length}):`);
      payables.forEach((a: any) => console.log(`  - Code: ${a.code} | Name: ${a.name} | Type: ${a.accountType}`));
    }

  } catch (err) {
    console.error("Error in script:", err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
