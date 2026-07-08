import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import dns from "dns";
import { promisify } from "util";

// Force Node.js DNS resolver to use Cloudflare and Google Public DNS
try {
  dns.setServers(["1.1.1.1", "8.8.8.8"]);
  console.log("ℹ️  Configured Node.js to use custom DNS (1.1.1.1, 8.8.8.8)");
} catch (e: any) {
  console.warn("⚠️  Failed to set custom DNS servers:", e.message);
}

const resolveSrv = promisify(dns.resolveSrv);
const resolveTxt = promisify(dns.resolveTxt);

// Load environment variables from the backend directory
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function getFallbackUri(srvUri: string): Promise<string | null> {
  try {
    const match = srvUri.match(/mongodb\+srv:\/\/([^:]+):([^@]+)@([^/]+)/);
    if (!match) return null;

    const [, username, password, host] = match;
    console.log(`\nDiagnosing SRV record resolution for host: ${host}...`);

    // 1. Resolve SRV record
    const srvRecords = await resolveSrv(`_mongodb._tcp.${host}`);
    if (!srvRecords || srvRecords.length === 0) {
      console.log("❌ DNS: No SRV records found.");
      return null;
    }
    console.log(`✅ DNS: Found ${srvRecords.length} SRV records:`);
    srvRecords.forEach(r => console.log(`  - ${r.name}:${r.port}`));

    // 2. Resolve TXT record for options
    let optionsStr = "ssl=true&authSource=admin";
    try {
      const txtRecords = await resolveTxt(host);
      if (txtRecords && txtRecords.length > 0) {
        console.log(`✅ DNS: Found TXT records:`);
        txtRecords.forEach(t => console.log(`  - ${t.join(" ")}`));
        optionsStr = txtRecords[0].join("&");
      }
    } catch (e: any) {
      console.log(`⚠️  DNS: Could not resolve TXT record: ${e.message}. Using default options.`);
    }

    // Build alternative URI
    const hostsList = srvRecords.map(r => `${r.name}:${r.port}`).join(",");
    const fallbackUri = `mongodb://${username}:${password}@${hostsList}/?${optionsStr}`;
    return fallbackUri;
  } catch (error: any) {
    console.error(`❌ DNS Diagnostics failed: ${error.message}`);
    return null;
  }
}

async function testConnection() {
  const uri = process.env.MONGODB_URI;
  console.log("=========================================");
  console.log("        MONGODB CONNECTION TESTER        ");
  console.log("=========================================");
  
  if (!uri) {
    console.error("❌ Error: MONGODB_URI environment variable is not defined in the backend/.env file.");
    process.exit(1);
  }

  // Mask sensitive parts of connection string for logging
  const mask = (str: string) => str.replace(/\/\/([^:]+):([^@]+)@/, "//***:***@");
  console.log(`Configured URI: ${mask(uri)}`);

  let success = false;

  // Attempt 1: Attempt standard connect using the configured URI
  try {
    console.log("\nAttempting connection with configured URI...");
    const startTime = Date.now();
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    const duration = Date.now() - startTime;
    console.log(`✅ Connection Successful in ${duration}ms!`);
    success = true;
  } catch (error: any) {
    console.error(`❌ Connection Failed with configured URI.`);
    console.error(`Error: ${error.message || error}`);
  }

  // Attempt 2: If failed and it's a mongodb+srv string, resolve SRV records manually and try fallback connection
  if (!success && uri.startsWith("mongodb+srv://")) {
    console.log("\nAttempting DNS bypass / direct connection fallback...");
    const fallbackUri = await getFallbackUri(uri);
    
    if (fallbackUri) {
      console.log(`Fallback URI: ${mask(fallbackUri)}`);
      try {
        console.log("Attempting connection with fallback URI...");
        const startTime = Date.now();
        await mongoose.connect(fallbackUri, { serverSelectionTimeoutMS: 5000 });
        const duration = Date.now() - startTime;
        console.log(`✅ Connection Successful using fallback URI in ${duration}ms!`);
        success = true;
      } catch (error: any) {
        console.error(`❌ Connection Failed with fallback URI.`);
        console.error(`Error: ${error.message || error}`);
      }
    }
  }

  if (success) {
    const connection = mongoose.connection;
    console.log("\nConnection details:");
    console.log(`  - Database Name: ${connection.name || "Default"}`);
    console.log(`  - Host: ${connection.host}`);
    console.log(`  - Port: ${connection.port}`);
    console.log(`  - Connection State: ${connection.readyState} (Connected)`);

    // Fetch lists of collections as a sanity check
    if (connection.db) {
      try {
        const collections = await connection.db.listCollections().toArray();
        console.log(`\nFound ${collections.length} collections:`);
        collections.slice(0, 10).forEach(col => {
          console.log(`  - ${col.name}`);
        });
        if (collections.length > 10) {
          console.log(`  - ... and ${collections.length - 10} more`);
        }
      } catch (colErr: any) {
        console.error("⚠️  Failed to retrieve collections:", colErr.message);
      }
    }
  } else {
    console.log("\n=========================================");
    console.log("❌ SUMMARY: Failed to connect to MongoDB.");
    console.log("=========================================");
    console.log("\nTroubleshooting recommendations:");
    console.log("1. IP Whitelisting: Ensure your current IP is allowed in MongoDB Atlas (Network Access).");
    console.log("2. DNS Issues: Check if your local DNS or network blocks SRV queries.");
    console.log("3. Firewall/Ports: Ensure outbound port 27017 is open on your network/firewall.");
    console.log("4. Credentials: Confirm the database username & password are correct.");
  }

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log("\nDisconnected from MongoDB.");
  }
  console.log("=========================================");
}

testConnection().catch(err => {
  console.error("Unexpected script error:", err);
  process.exit(1);
});
