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

  try {
    client = await pool.connect();
    console.log('DB client connected for total revenue');

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

        // Add date condition for in-store, APPLYING the +1 day workaround
        if (areDatesValid) {
            const adjustedStartDate = addDays(startDate, 1); // Add 1 day to start date
            const adjustedEndDateExclusive = addDays(endDate, 2); // Add 2 days to end date (making it exclusive < end+1+1)

            // Use >= start+1 AND < end+1+1 as per README
            inStoreConditions.push(`transaction_date >= $${inStoreParamIndex++}`);
            inStoreParams.push(adjustedStartDate);
            inStoreConditions.push(`transaction_date < $${inStoreParamIndex++}`);
            inStoreParams.push(adjustedEndDateExclusive);
            // Removed time conditions as date workaround should handle the range
            console.log(`Adjusted In-Store Date Range for Revenue: >= ${adjustedStartDate} AND < ${adjustedEndDateExclusive}`);
        }

        // Add store condition for in-store
        if (inStoreId) {
            inStoreConditions.push(`store_id = $${inStoreParamIndex++}`);
            inStoreParams.push(inStoreId);
        } else if (store !== 'All') {
            console.log("No specific inStoreId matched, not filtering in-store revenue query by store_id.");
        }

        if (inStoreConditions.length > 0) {
            inStoreQuery += ` WHERE ${inStoreConditions.join(' AND ')}`;
        }

        console.log('Executing In-Store Revenue Query:', inStoreQuery);
        console.log('With params:', inStoreParams);
        const inStoreResult = await client.query(inStoreQuery, inStoreParams);
        inStoreRevenue = parseFloat(inStoreResult.rows[0]?.revenue || 0);
        console.log('In-Store Revenue:', inStoreRevenue);
    }

    // --- Query 2: Online Revenue (Run if source is 'All' or 'Bite') --- 
    let onlineRevenue = 0;
    if (revenueSource === 'All' || revenueSource === 'Bite') { 
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
            console.log(`Using Epoch range for Bite revenue between ${startTimestamp} and ${endTimestamp}`);
        }

        // Add store condition for online
        if (onlineSiteId) {
            onlineConditions.push(`site_id = $${onlineParamIndex++}`);
            onlineParams.push(onlineSiteId);
        } else if (store !== 'All') {
            console.log("No specific onlineSiteId matched, not filtering online revenue query by site_id.");
        }

        if (onlineConditions.length > 0) {
            onlineQuery += ` WHERE ${onlineConditions.join(' AND ')}`;
        }

        console.log('Executing Online Revenue Query:', onlineQuery);
        console.log('With params:', onlineParams);
        const onlineResult = await client.query(onlineQuery, onlineParams);
        onlineRevenue = parseFloat(onlineResult.rows[0]?.revenue || 0);
        console.log('Online Revenue:', onlineRevenue);
    }

    // Calculate total *after* getting components
    const totalRevenue = inStoreRevenue + onlineRevenue;

    // --- Final Result ---
    const dateLogPart = areDatesValid ? ` for ${startDate} to ${endDate}` : '';
    const sourceLogPart = revenueSource === 'All' ? 'All Sources' : revenueSource;
    console.log(`Total Revenue for store ${store} (${sourceLogPart})${dateLogPart}:`, totalRevenue);
    console.log(`  - In-Store: ${inStoreRevenue}`); // Log breakdown
    console.log(`  - Online:   ${onlineRevenue}`); // Log breakdown

    // Return breakdown
    res.status(200).json({
        totalRevenue: totalRevenue,
        inStoreRevenue: inStoreRevenue,
        onlineRevenue: onlineRevenue
    });

  } catch (err) {
    console.error('Error fetching total revenue:', err.stack);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  } finally {
    if (client) {
      client.release();
      console.log('DB client released after total revenue query');
    }
  }
});

// --- Helper function to add days to a date string (YYYY-MM-DD) ---
function addDays(dateString, days) {
  const date = new Date(dateString);
  date.setUTCDate(date.getUTCDate() + days); // Use UTC functions to avoid timezone issues with date-only strings
  // Format back to YYYY-MM-DD
  const year = date.getUTCFullYear();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Get Total Orders (Combined In-Store and Online)
app.get('/api/total-orders', async (req, res) => {
  // Extract store, startDate, endDate, and source from query parameters
  const { store, startDate, endDate, source } = req.query;
  const orderSource = source || 'All'; // Default to 'All' if not provided
  console.log(`GET /api/total-orders received - Store: ${store}, Source: ${orderSource}, Start: ${startDate}, End: ${endDate}`);

  // --- Basic Date Validation ---
  const areDatesValid = startDate && endDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate);
  if ((startDate || endDate) && !areDatesValid) {
     return res.status(400).json({ error: 'Invalid date format or missing pair. Use YYYY-MM-DD for both startDate and endDate.' });
  }
  console.log(`Date parameters ${areDatesValid ? 'are valid' : 'are NOT valid or not provided'}.`);
  // --- End Date Validation ---

  let client;

  try {
    client = await pool.connect();
    console.log('DB client connected for total orders');

    // Map frontend selection to database identifiers
    const onlineSiteId = store === 'Wagga' ? '641' : store === 'Preston' ? '1837' : null;
    const inStoreId = store === 'Wagga' ? 'wagga' : store === 'Preston' ? 'preston' : null;

    // --- Conditionally Execute Queries based on orderSource ---

    // --- Query 1: In-Store Orders (Run if source is 'All' or 'In Store') ---
    let inStoreOrders = 0;
    if (orderSource === 'All' || orderSource === 'In Store') {
        // Use COUNT(*) to count transactions
        let inStoreQuery = `SELECT COUNT(*) as order_count FROM transactions`;
        const inStoreParams = [];
        const inStoreConditions = [];
        let inStoreParamIndex = 1;

        // Add date condition for in-store, applying the +1 day workaround
        if (areDatesValid) {
            const adjustedStartDate = addDays(startDate, 1); // Add 1 day to start date
            const adjustedEndDateExclusive = addDays(endDate, 2); // Add 2 days to end date (making it exclusive < end+1+1)

            // Use >= start+1 AND < end+1+1 as per README
            inStoreConditions.push(`transaction_date >= $${inStoreParamIndex++}`);
            inStoreParams.push(adjustedStartDate);
            inStoreConditions.push(`transaction_date < $${inStoreParamIndex++}`);
            inStoreParams.push(adjustedEndDateExclusive);

            console.log(`Adjusted In-Store Date Range: >= ${adjustedStartDate} AND < ${adjustedEndDateExclusive}`);
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

        console.log('Executing In-Store Order Count Query:', inStoreQuery);
        console.log('With params:', inStoreParams);
        const inStoreResult = await client.query(inStoreQuery, inStoreParams);
        inStoreOrders = parseInt(inStoreResult.rows[0]?.order_count || 0, 10);
        console.log('In-Store Orders:', inStoreOrders);
    }

    // --- Query 2: Online Orders (Run if source is 'All' or 'Bite') ---
    let onlineOrders = 0;
    if (orderSource === 'All' || orderSource === 'Bite') {
        // Use COUNT(*) to count bite_orders
        let onlineQuery = `SELECT COUNT(*) as order_count FROM bite_orders`;
        const onlineParams = [];
        const onlineConditions = [];
        let onlineParamIndex = 1;

        // Add date condition for online (using ready_at_time epoch timestamp)
        if (areDatesValid) {
            const startTimestamp = `${startDate} 00:00:00`;
            const endTimestamp = `${endDate} 23:59:59`;
             // Convert YYYY-MM-DD HH:MM:SS to epoch assuming the date string refers to UTC or a consistent timezone known by the DB
            onlineConditions.push(`ready_at_time BETWEEN EXTRACT(EPOCH FROM $${onlineParamIndex++}::timestamp) AND EXTRACT(EPOCH FROM $${onlineParamIndex++}::timestamp)`);
            onlineParams.push(startTimestamp, endTimestamp);
            console.log(`Using Epoch range for Bite orders between ${startTimestamp} and ${endTimestamp}`);
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

        console.log('Executing Online Order Count Query:', onlineQuery);
        console.log('With params:', onlineParams);
        const onlineResult = await client.query(onlineQuery, onlineParams);
        onlineOrders = parseInt(onlineResult.rows[0]?.order_count || 0, 10);
        console.log('Online Orders:', onlineOrders);
    }

    // Calculate total *after* getting components
    const totalOrders = inStoreOrders + onlineOrders;

    // --- Final Result ---
    const dateLogPart = areDatesValid ? ` for ${startDate} to ${endDate}` : '';
    const sourceLogPart = orderSource === 'All' ? 'All Sources' : orderSource;
    console.log(`Total Orders for store ${store} (${sourceLogPart})${dateLogPart}:`, totalOrders);
    console.log(`  - In-Store: ${inStoreOrders}`); // Log breakdown
    console.log(`  - Online:   ${onlineOrders}`); // Log breakdown

    // Return breakdown
    res.status(200).json({
        totalOrders: totalOrders,
        inStoreOrders: inStoreOrders,
        onlineOrders: onlineOrders
    });

  } catch (err) {
    console.error('Error fetching total orders:', err.stack);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  } finally {
    if (client) {
      client.release();
      console.log('DB client released after total orders query');
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