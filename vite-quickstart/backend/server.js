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

// --- Get Sales Trend Data ---
app.get('/api/sales-trend', async (req, res) => {
    const { store, startDate, endDate, source } = req.query;
    const revenueSource = source || 'All';
    console.log(`GET /api/sales-trend received - Store: ${store}, Source: ${revenueSource}, Start: ${startDate}, End: ${endDate}`);

    // --- Basic Date Validation ---
    const areDatesValid = startDate && endDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate);
    if (!areDatesValid) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD for both startDate and endDate.' });
    }
    console.log(`Date parameters are valid.`);
    // --- End Date Validation ---

    let client;
    try {
        client = await pool.connect();
        console.log('DB client connected for sales trend');

        // Map frontend selection to database identifiers
        const onlineSiteId = store === 'Wagga' ? '641' : store === 'Preston' ? '1837' : null;
        const inStoreId = store === 'Wagga' ? 'wagga' : store === 'Preston' ? 'preston' : null;

        // --- Prepare parameters for the complex query ---
        const params = [];
        let paramIndex = 1;

        params.push(startDate); // $1: start date for series
        const startDateParamIndex = paramIndex++;
        params.push(endDate);   // $2: end date for series
        const endDateParamIndex = paramIndex++;

        // In-store query part conditions and params
        params.push(revenueSource); // $3: source for in-store check 1
        const inStoreSourceCheck1ParamIndex = paramIndex++;
        params.push('In Store');     // $4: source for in-store check 2
        const inStoreSourceCheck2ParamIndex = paramIndex++;
        
        const includeInStore = revenueSource === 'All' || revenueSource === 'In Store';
        const filterInStoreByStoreId = includeInStore && store !== 'All' && inStoreId;
        params.push(filterInStoreByStoreId ? inStoreId : null); // $5: store_id for in-store (or null)
        const inStoreIdParamIndex = paramIndex++;

        // In-store date range workaround
        const adjustedStartDate = addDays(startDate, 1); // Add 1 day
        const adjustedEndDateExclusive = addDays(endDate, 2); // Add 2 days for < comparison
        params.push(adjustedStartDate); // $6: adjusted start date for in-store
        const inStoreStartDateParamIndex = paramIndex++;
        params.push(adjustedEndDateExclusive); // $7: adjusted end date for in-store
        const inStoreEndDateParamIndex = paramIndex++;

        // Online query part conditions and params
        params.push(revenueSource); // $8: source for online check 1
        const onlineSourceCheck1ParamIndex = paramIndex++;
        params.push('Bite');         // $9: source for online check 2
        const onlineSourceCheck2ParamIndex = paramIndex++;

        const includeOnline = revenueSource === 'All' || revenueSource === 'Bite';
        const filterOnlineBySiteId = includeOnline && store !== 'All' && onlineSiteId;
        params.push(filterOnlineBySiteId ? onlineSiteId : null); // $10: site_id for online (or null)
        const onlineSiteIdParamIndex = paramIndex++;

        // Online date range (epoch)
        const startTimestamp = `${startDate} 00:00:00`;
        const endTimestamp = `${endDate} 23:59:59`;
        params.push(startTimestamp); // $11: start timestamp for online
        const onlineStartDateParamIndex = paramIndex++;
        params.push(endTimestamp);   // $12: end timestamp for online
        const onlineEndDateParamIndex = paramIndex++;
        
        // --- Construct the SQL Query --- 
        const query = `
            WITH date_series AS (
              SELECT generate_series(
                       $${startDateParamIndex}::date,
                       $${endDateParamIndex}::date,
                       '1 day'::interval
                     )::date AS sale_date
            ),
            daily_sales AS (
                -- In-Store Sales (adjusted date for joining)
                SELECT 
                    transaction_date::date - interval '1 day' AS sale_date, -- Adjust back to actual date
                    SUM(total_amount) as daily_revenue
                FROM transactions
                WHERE 
                    ($${inStoreSourceCheck1ParamIndex} = 'All' OR $${inStoreSourceCheck2ParamIndex} = 'In Store')
                    AND ($${inStoreIdParamIndex}::varchar IS NULL OR store_id = $${inStoreIdParamIndex}::varchar)
                    AND transaction_date >= $${inStoreStartDateParamIndex}::date
                    AND transaction_date < $${inStoreEndDateParamIndex}::date
                GROUP BY transaction_date -- Group by stored date
            
                UNION ALL
            
                -- Online Sales (timezone adjusted date for joining)
                SELECT 
                    (timezone('Australia/Sydney', TO_TIMESTAMP(ready_at_time)))::date AS sale_date,
                    SUM(total_price) as daily_revenue
                FROM bite_orders
                WHERE
                    ($${onlineSourceCheck1ParamIndex} = 'All' OR $${onlineSourceCheck2ParamIndex} = 'Bite')
                    AND ($${onlineSiteIdParamIndex}::varchar IS NULL OR site_id = $${onlineSiteIdParamIndex}::varchar)
                    AND ready_at_time BETWEEN EXTRACT(EPOCH FROM $${onlineStartDateParamIndex}::timestamp) AND EXTRACT(EPOCH FROM $${onlineEndDateParamIndex}::timestamp)
                GROUP BY (timezone('Australia/Sydney', TO_TIMESTAMP(ready_at_time)))::date
            )
            SELECT 
                to_char(ds.sale_date, 'YYYY-MM-DD') AS date,
                COALESCE(SUM(agg.daily_revenue), 0)::float as sales -- Ensure float output
            FROM date_series ds
            LEFT JOIN daily_sales agg ON ds.sale_date = agg.sale_date
            GROUP BY ds.sale_date
            ORDER BY ds.sale_date ASC;
        `;

        console.log('Executing Sales Trend Query:', query); // Log the query structure
        console.log('With params:', params); // Log the parameters

        const result = await client.query(query, params);
        console.log(`Sales Trend Query returned ${result.rows.length} rows.`);

        res.status(200).json(result.rows);

    } catch (err) {
        console.error('Error fetching sales trend:', err.stack);
        res.status(500).json({ error: 'Internal Server Error', details: err.message });
    } finally {
        if (client) {
            client.release();
            console.log('DB client released after sales trend query');
        }
    }
});

// --- Get Top Selling Products ---
app.get('/api/top-products', async (req, res) => {
    const { store, startDate, endDate, source, limit = 10 } = req.query; // Default limit to 10
    const revenueSource = source || 'All';
    const productLimit = parseInt(limit, 10);

    console.log(`GET /api/top-products received - Store: ${store}, Source: ${revenueSource}, Start: ${startDate}, End: ${endDate}, Limit: ${productLimit}`);

    // --- Basic Date Validation ---
    console.log(`Backend received raw dates - Start: ${startDate}, End: ${endDate}`); 
    const areDatesValid = startDate && endDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate);
    if (!areDatesValid) {
        console.error(`Date validation failed for Start: ${startDate}, End: ${endDate}`); // Log validation failure
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD for both startDate and endDate.' });
    }
    console.log(`Date parameters are valid.`);
    // --- End Date Validation ---

    let client;
    try {
        client = await pool.connect();
        console.log('DB client connected for top products');

        // Map frontend selection to database identifiers
        const onlineSiteId = store === 'Wagga' ? '641' : store === 'Preston' ? '1837' : null;
        const inStoreId = store === 'Wagga' ? 'wagga' : store === 'Preston' ? 'preston' : null;

        // --- Prepare parameters - REVISED ---
        const params = [];
        let paramIndex = 1;

        // Add parameters ONLY used in the query, in the correct order
        params.push(revenueSource); // $1: sourceParamIndex
        const sourceParamIndex = paramIndex++;
        params.push(productLimit); // $2: limitParamIndex
        const limitParamIndex = paramIndex++;

        // In-store specific params
        const includeInStore = revenueSource === 'All' || revenueSource === 'In Store';
        const filterInStoreByStoreId = includeInStore && store !== 'All' && inStoreId;
        params.push(filterInStoreByStoreId ? inStoreId : null); // $3: inStoreIdParamIndex
        const inStoreIdParamIndex = paramIndex++;
        const adjustedStartDate = addDays(startDate, 1);
        const adjustedEndDateExclusive = addDays(endDate, 2);
        params.push(adjustedStartDate); // $4: inStoreStartDateParamIndex
        const inStoreStartDateParamIndex = paramIndex++;
        params.push(adjustedEndDateExclusive); // $5: inStoreEndDateParamIndex
        const inStoreEndDateParamIndex = paramIndex++;

        // Online specific params
        const includeOnline = revenueSource === 'All' || revenueSource === 'Bite';
        const filterOnlineBySiteId = includeOnline && store !== 'All' && onlineSiteId;
        params.push(filterOnlineBySiteId ? onlineSiteId : null); // $6: onlineSiteIdParamIndex
        const onlineSiteIdParamIndex = paramIndex++;
        const startTimestamp = `${startDate} 00:00:00`;
        const endTimestamp = `${endDate} 23:59:59`;
        params.push(startTimestamp); // $7: onlineStartDateParamIndex
        const onlineStartDateParamIndex = paramIndex++;
        params.push(endTimestamp);   // $8: onlineEndDateParamIndex
        const onlineEndDateParamIndex = paramIndex++;


        // --- Construct the SQL Query - REVISED INDICES ---
        const query = `
            WITH instore_products AS (
                SELECT
                    ti.product_id::text AS product_identifier,
                    'In-Store' AS source_type,
                    SUM(ti.quantity) AS total_quantity,
                    SUM(ti.unit_price * ti.quantity) AS total_revenue
                FROM transaction_items ti
                JOIN transactions t ON ti.transaction_id = t.id
                WHERE
                    ($1 = 'All' OR $1 = 'In Store') -- $1: revenueSource
                    AND ($3::varchar IS NULL OR t.store_id = $3::varchar) -- $3: inStoreId
                    AND t.transaction_date >= $4::date -- $4: adjustedStartDate
                    AND t.transaction_date < $5::date -- $5: adjustedEndDateExclusive
                    AND ti.quantity > 0 AND ti.unit_price > 0
                GROUP BY ti.product_id
            ),
            online_products AS (
                 SELECT
                     boi.name AS product_identifier,
                     'Online' AS source_type,
                     SUM(boi.quantity) AS total_quantity,
                     SUM(boi.line_price) AS total_revenue
                 FROM bite_order_items boi
                 JOIN bite_orders bo ON boi.order_id = bo.order_id
                 WHERE
                     ($1 = 'All' OR $1 = 'Bite') -- $1: revenueSource
                     AND ($6::varchar IS NULL OR bo.site_id = $6::varchar) -- $6: onlineSiteId
                     AND bo.ready_at_time BETWEEN EXTRACT(EPOCH FROM $7::timestamp) AND EXTRACT(EPOCH FROM $8::timestamp) -- $7, $8: timestamps
                 GROUP BY boi.name
             ),
            combined_products AS (
                SELECT product_identifier, source_type, total_quantity, total_revenue FROM online_products
                UNION ALL
                SELECT product_identifier, source_type, total_quantity, total_revenue FROM instore_products
            ),
            aggregated_products AS (
                 SELECT
                     product_identifier,
                     SUM(total_quantity) as final_quantity,
                     SUM(total_revenue) as final_revenue
                 FROM combined_products
                 GROUP BY product_identifier
             )
            SELECT
                ap.product_identifier,
                ap.final_quantity,
                ap.final_revenue::float
            FROM aggregated_products ap
            ORDER BY final_revenue DESC NULLS LAST
            LIMIT $2; -- $2: productLimit
        `;

        console.log('Executing Top Products Query (Simple):', query.substring(0, 500) + '...');
        console.log('With params:', params);

        const result = await client.query(query, params);
        console.log(`Top Products Query returned ${result.rows.length} rows.`);

        // We will need to map product_id to names here once you provide the mapping.
        // For now, it returns product_identifier which is name for online, id for in-store.
        res.status(200).json(result.rows);

    } catch (err) {
        console.error('Error fetching top products:', err.stack);
        res.status(500).json({ error: 'Internal Server Error', details: err.message });
    } finally {
        if (client) {
            client.release();
            console.log('DB client released after top products query');
        }
    }
});

// --- Get Sales Activity Data (for Heatmap) ---
app.get('/api/sales-activity', async (req, res) => {
    const { store, startDate, endDate, source } = req.query;
    const revenueSource = source || 'All';

    console.log(`GET /api/sales-activity received - Store: ${store}, Source: ${revenueSource}, Start: ${startDate}, End: ${endDate}`);

    // --- Basic Date Validation ---
    const areDatesValid = startDate && endDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate);
    if (!areDatesValid) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD for both startDate and endDate.' });
    }
    console.log(`Date parameters are valid.`);
    // --- End Date Validation ---

    let client;
    try {
        client = await pool.connect();
        console.log('DB client connected for sales activity');

        // Map frontend selection to database identifiers
        const onlineSiteId = store === 'Wagga' ? '641' : store === 'Preston' ? '1837' : null;
        const inStoreId = store === 'Wagga' ? 'wagga' : store === 'Preston' ? 'preston' : null;

        // --- Prepare parameters ---
        const params = [];
        let paramIndex = 1;

        // Common params
        params.push(revenueSource); // $1: sourceParamIndex
        const sourceParamIndex = paramIndex++;

        // In-store specific params
        const includeInStore = revenueSource === 'All' || revenueSource === 'In Store';
        const filterInStoreByStoreId = includeInStore && store !== 'All' && inStoreId;
        params.push(filterInStoreByStoreId ? inStoreId : null); // $2: inStoreIdParamIndex
        const inStoreIdParamIndex = paramIndex++;
        const adjustedStartDate = addDays(startDate, 1);
        const adjustedEndDateExclusive = addDays(endDate, 2);
        params.push(adjustedStartDate); // $3: inStoreStartDateParamIndex
        const inStoreStartDateParamIndex = paramIndex++;
        params.push(adjustedEndDateExclusive); // $4: inStoreEndDateParamIndex
        const inStoreEndDateParamIndex = paramIndex++;

        // Online specific params
        const includeOnline = revenueSource === 'All' || revenueSource === 'Bite';
        const filterOnlineBySiteId = includeOnline && store !== 'All' && onlineSiteId;
        params.push(filterOnlineBySiteId ? onlineSiteId : null); // $5: onlineSiteIdParamIndex
        const onlineSiteIdParamIndex = paramIndex++;
        const startTimestamp = `${startDate} 00:00:00`;
        const endTimestamp = `${endDate} 23:59:59`;
        params.push(startTimestamp); // $6: onlineStartDateParamIndex
        const onlineStartDateParamIndex = paramIndex++;
        params.push(endTimestamp);   // $7: onlineEndDateParamIndex
        const onlineEndDateParamIndex = paramIndex++;

        // --- Construct the SQL Query ---
        const query = `
            WITH combined_activity AS (
                -- In-Store Activity
                SELECT
                    t.day_of_week, -- Use pre-calculated day
                    EXTRACT(HOUR FROM t.transaction_time) AS hour_of_day,
                    t.total_amount AS sales_amount
                FROM transactions t
                WHERE
                    ($${sourceParamIndex} = 'All' OR $${sourceParamIndex} = 'In Store')
                    AND ($${inStoreIdParamIndex}::varchar IS NULL OR t.store_id = $${inStoreIdParamIndex}::varchar)
                    AND t.transaction_date >= $${inStoreStartDateParamIndex}::date
                    AND t.transaction_date < $${inStoreEndDateParamIndex}::date

                UNION ALL

                -- Online Activity
                SELECT
                    -- Adjust ISODOW (Mon=1, Sun=7) if needed to match transactions.day_of_week convention
                    -- Assuming transactions.day_of_week might also be Mon=1, Sun=7 or similar standard.
                    -- Check DB or data if convention differs!
                    EXTRACT(ISODOW FROM timezone('Australia/Sydney', TO_TIMESTAMP(bo.ready_at_time))) AS day_of_week,
                    EXTRACT(HOUR FROM timezone('Australia/Sydney', TO_TIMESTAMP(bo.ready_at_time))) AS hour_of_day,
                    bo.total_price AS sales_amount
                FROM bite_orders bo
                WHERE
                    ($${sourceParamIndex} = 'All' OR $${sourceParamIndex} = 'Bite')
                    AND ($${onlineSiteIdParamIndex}::varchar IS NULL OR bo.site_id = $${onlineSiteIdParamIndex}::varchar)
                    AND bo.ready_at_time BETWEEN EXTRACT(EPOCH FROM $${onlineStartDateParamIndex}::timestamp) AND EXTRACT(EPOCH FROM $${onlineEndDateParamIndex}::timestamp)
            )
            SELECT
                day_of_week::int, -- Ensure integer type
                hour_of_day::int, -- Ensure integer type
                COALESCE(SUM(sales_amount), 0)::float AS total_sales,
                COUNT(*)::int AS order_count
            FROM combined_activity
            GROUP BY day_of_week, hour_of_day
            ORDER BY day_of_week, hour_of_day; -- Order for consistency
        `;

        console.log('Executing Sales Activity Query:', query.substring(0, 500) + '...');
        console.log('With params:', params);

        const result = await client.query(query, params);
        console.log(`Sales Activity Query returned ${result.rows.length} rows.`);

        res.status(200).json(result.rows);

    } catch (err) {
        console.error('Error fetching sales activity:', err.stack);
        res.status(500).json({ error: 'Internal Server Error', details: err.message });
    } finally {
        if (client) {
            client.release();
            console.log('DB client released after sales activity query');
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