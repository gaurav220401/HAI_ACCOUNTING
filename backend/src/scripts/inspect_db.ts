import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load env variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const uri = process.env.MONGODB_URI || 'mongodb+srv://haldarainit_db_user:1Q4nQwMJI9ohOvce@cluster0.5uicr6o.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function run() {
  try {
    await mongoose.connect(uri);
    console.log("Connected to MongoDB using Mongoose successfully");
    
    const QuoteSchema = new mongoose.Schema({}, { strict: false });
    const Quote = mongoose.models.Quote || mongoose.model('Quote', QuoteSchema, 'quotes');
    
    const count = await Quote.countDocuments();
    console.log("Total quotes count:", count);
    
    const allQuotes = await Quote.find({}).lean();
    console.log("\nAll Quotes in DB:");
    allQuotes.forEach((q: any) => {
      console.log(`- ID: ${q._id}, Number: ${q.quoteNumber}, Status: ${q.status}, Total: ${q.total}, subTotal: ${q.subTotal}`);
      if (q.items) {
        q.items.forEach((item: any, idx: number) => {
          console.log(`  Item ${idx + 1}: Qty=${item.quantity}, Rate=${item.rate}, Amount=${item.amount}`);
        });
      }
    });

  } catch (err) {
    console.error("Error in script:", err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
