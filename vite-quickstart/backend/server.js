'use strict';

const express = require('express');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');

// Load environment variables from the root .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// --- Configuration ---
const PORT = process.env.BACKEND_PORT || 3001; // Use a different port than the frontend
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'; // Default Vite dev port

// --- Database Connection ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Assumes DATABASE_URL is in your .env
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false // Required for Neon in production, adjust if needed
});

pool.on('connect', () => {
  console.log('Connected to the database');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// --- Express App Setup ---
const app = express();

// Enable CORS for requests from the frontend
app.use(cors({ origin: FRONTEND_URL }));

// Basic Middleware
app.use(express.json()); // for parsing application/json

// --- API Endpoints ---

// Health Check
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'UP' });
});

// Get Total Revenue (Combined In-Store and Online)
app.get('/api/total-revenue', async (req, res) => {
  // Extract store, startDate, endDate, and source from query parameters
  const { store, startDate, endDate, source } = req.query;
  const revenueSource = source || 'All'; // Default to 'All' if not provided
  console.log(`GET /api/total-revenue received - Store: ${store}, Source: ${revenueSource}, Start: ${startDate}, End: ${endDate}`);

  // --- Basic Date Validation ---
  const areDatesValid = startDate && endDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate);
  if ((startDate || endDate) && !areDatesValid) {
     return res.status(400).json({ error: 'Invalid date format or missing pair. Use YYYY-MM-DD for both startDate and endDate.' });
  }
  console.log(`Date parameters ${areDatesValid ? 'are valid' : 'are NOT valid or not provided'}.`);
  // --- End Date Validation ---

  let client;
  let totalRevenue = 0; // Initialize total revenue

  try {
    client = await pool.connect();
    console.log('DB client connected');

    // Map frontend selection to database identifiers
    const onlineSiteId = store === 'Wagga' ? '641' : store === 'Preston' ? '1837' : null;
    const inStoreId = store === 'Wagga' ? 'wagga' : store === 'Preston' ? 'preston' : null;

    // --- Conditionally Execute Queries based on revenueSource --- 

    // --- Query 1: In-Store Revenue (Run if source is 'All' or 'In Store') --- 
    let inStoreRevenue = 0;
    if (revenueSource === 'All' || revenueSource === 'In Store') { 
        let inStoreQuery = `SELECT COALESCE(SUM(total_amount), 0) as revenue FROM transactions`;
        const inStoreParams = [];
        const inStoreConditions = [];
        let inStoreParamIndex = 1;

        // Add date condition for in-store
        if (areDatesValid) {
            inStoreConditions.push(`transaction_date BETWEEN $${inStoreParamIndex++} AND $${inStoreParamIndex++}`);
            inStoreParams.push(startDate, endDate);
            inStoreConditions.push(`transaction_time >= '00:00:00'`);
            inStoreConditions.push(`transaction_time <= '23:59:59'`);
        }

        // Add store condition for in-store
        if (inStoreId) {
            inStoreConditions.push(`store_id = $${inStoreParamIndex++}`);
            inStoreParams.push(inStoreId);
        } else if (store !== 'All') {
            console.log("No specific inStoreId matched, not filtering in-store query by store_id.");
        }

        if (inStoreConditions.length > 0) {
            inStoreQuery += ` WHERE ${inStoreConditions.join(' AND ')}`;
        }

        console.log('Executing In-Store Query:', inStoreQuery);
        console.log('With params:', inStoreParams);
        const inStoreResult = await client.query(inStoreQuery, inStoreParams);
        inStoreRevenue = parseFloat(inStoreResult.rows[0]?.revenue || 0);
        console.log('In-Store Revenue:', inStoreRevenue);
        totalRevenue += inStoreRevenue; // Add to total
    }

    // --- Query 2: Online Revenue (Run if source is 'All' or 'Bite') --- 
    let onlineRevenue = 0;
    if (revenueSource === 'All' || revenueSource === 'Bite') { 
        // IMPORTANT: Using SUM(total_price)
        let onlineQuery = `SELECT COALESCE(SUM(total_price), 0) as revenue FROM bite_orders`;
        const onlineParams = [];
        const onlineConditions = [];
        let onlineParamIndex = 1;

        // Add date condition for online
        if (areDatesValid) {
            const startTimestamp = `${startDate} 00:00:00`;
            const endTimestamp = `${endDate} 23:59:59`;
            onlineConditions.push(`ready_at_time BETWEEN EXTRACT(EPOCH FROM $${onlineParamIndex++}::timestamp) AND EXTRACT(EPOCH FROM $${onlineParamIndex++}::timestamp)`);
            onlineParams.push(startTimestamp, endTimestamp);
        }

        // Add store condition for online
        if (onlineSiteId) {
            onlineConditions.push(`site_id = $${onlineParamIndex++}`);
            onlineParams.push(onlineSiteId);
        } else if (store !== 'All') {
            console.log("No specific onlineSiteId matched, not filtering online query by site_id.");
        }

        if (onlineConditions.length > 0) {
            onlineQuery += ` WHERE ${onlineConditions.join(' AND ')}`;
        }

        console.log('Executing Online Query:', onlineQuery);
        console.log('With params:', onlineParams);
        const onlineResult = await client.query(onlineQuery, onlineParams);
        onlineRevenue = parseFloat(onlineResult.rows[0]?.revenue || 0);
        console.log('Online Revenue:', onlineRevenue);
        totalRevenue += onlineRevenue; // Add to total
    }

    // --- Final Result ---
    const dateLogPart = areDatesValid ? ` for ${startDate} to ${endDate}` : '';
    const sourceLogPart = revenueSource === 'All' ? 'All Sources' : revenueSource;
    console.log(`Total Revenue for store ${store} (${sourceLogPart})${dateLogPart}:`, totalRevenue);

    res.status(200).json({ totalRevenue: totalRevenue }); // Send the final summed revenue

  } catch (err) {
    console.error('Error fetching total revenue:', err.stack);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  } finally {
    if (client) {
      client.release();
      console.log('DB client released');
    }
  }
});

// --- Server Start ---
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log(`Accepting requests from: ${FRONTEND_URL}`);
});

// --- Graceful Shutdown ---
process.on('SIGINT', async () => {
  console.log('\nGracefully shutting down from SIGINT (Ctrl+C)');
  await pool.end();
  console.log('Database pool closed.');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Gracefully shutting down from SIGTERM');
  await pool.end();
  console.log('Database pool closed.');
  process.exit(0);
}); 