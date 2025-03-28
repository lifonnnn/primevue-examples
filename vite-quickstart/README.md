# PrimeVue Vite Example

<br />

<div align="start">
  
![PrimeVue Version](https://img.shields.io/badge/PrimeVue-v4.2.5-blue)
![Vue Version](https://img.shields.io/badge/Vue.js-v3.4.27-42b883)
![Vite Version](https://img.shields.io/badge/Vite-v5.2.13-646cff)

</div>

## Overview

This example demonstrates a basic PrimeVue integration with Vite, showcasing a modern and responsive dashboard interface. The project features various PrimeVue components with standard CSS styling.

## Features

- PrimeVue components with CSS styling
- Powered by Vite for fast development
- Real-time search functionality
- Customizable UI components

## Tech Stack

- [Vue.js](https://vuejs.org/) - The Progressive JavaScript Framework
- [PrimeVue](https://primevue.org/) - The Ultimate Vue UI Component Library
- [Vite](https://vitejs.dev/) - Next Generation Frontend Tooling

## Getting Started

1. Clone the repository:

```bash
git clone https://github.com/primefaces/primevue-examples.git
cd primevue-examples/vite-quickstart
```

2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run dev
```

4. Build for production:

```bash
npm run build
```

## Project Structure

```
vite-quickstart/
├── src/
│   ├── components/         # Vue components
│   ├── assets/            # Static assets
│   │   └── styles/        # CSS styles
│   └── App.vue            # Root component
├── public/                # Public static assets
├── index.html            # Entry HTML file
└── vite.config.js        # Vite configuration
```

## Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/primefaces/primevue-examples/issues).


---------------------------------


# Database Date/Time Handling (`transactions` table)

**IMPORTANT:** Querying the `transactions` table by date requires a specific workaround due to the behavior observed in the current database environment (Neon DB via Replit).

## Data Storage

*   `transaction_date`: Stores the **correct local date** of the transaction (Type: `DATE`).
*   `transaction_time`: Stores the **correct local time** of the transaction (Type: `TIME`).
*   **Historical Fix:** An initial import error caused dates to be stored incorrectly (off by -1 day). A mass update (`UPDATE transactions SET transaction_date = transaction_date + INTERVAL '1 day'`) was performed to correct this. The `transaction_date` column now accurately reflects the calendar date on which the transaction occurred in the local timezone (e.g., AEDT/AEST).

## Query Behavior Anomaly

Despite the `transaction_date` column storing the correct local date, querying it directly using standard date comparison exhibits unexpected behavior in this environment:

*   A query like `WHERE transaction_date = DATE 'YYYY-MM-DD'` **effectively retrieves data for the *previous* day** (`YYYY-MM-DD` minus 1 day).
*   For example, `WHERE transaction_date = DATE '2025-03-25'` actually returns records whose *real-world transaction date* was March 24th, 2025 (and are correctly stored with `transaction_date = '2025-03-24'`).

This behavior persists even with explicit `DATE` casting and occurs regardless of the session timezone setting (`GMT` was observed). It appears to be an anomaly related to how `DATE` comparisons are interpreted in this specific environment.

## Required Query Workaround

To retrieve data for a specific `Actual Local Date`, you **MUST add one day to the date literal** in your SQL query's `WHERE` clause.

**Examples:**

1.  **To get all transactions for March 24th, 2025:**
    ```sql
    SELECT *
    FROM transactions
    WHERE transaction_date = DATE '2025-03-25'; -- Use the date AFTER the one you want
    ```

2.  **To get all transactions for March 23rd, 2025:**
    ```sql
    SELECT *
    FROM transactions
    WHERE transaction_date = DATE '2025-03-24'; -- Use the date AFTER the one you want
    ```

3.  **To get transactions for a date range (e.g., March 23rd to March 24th, 2025, inclusive):**
    Use `>=` the day *after* your start date and `<` the day *after* your end date + 1.
    ```sql
    SELECT *
    FROM transactions
    WHERE
        transaction_date >= DATE '2025-03-24' -- Day after start date (23rd+1)
    AND transaction_date < DATE '2025-03-26'; -- Day after end date + 1 (24th+1+1)
    ```

## Data Display Note

Some SQL clients or tools (including the Replit/Neon interface) may display the `DATE` column in a potentially confusing `YYYY-MM-DDTHH:MM:SS.sssZ` format (e.g., `"2025-03-24T13:00:00.000Z"`). This seems to be a display artifact and does **not** reflect time/timezone information actually stored in the `DATE` column.

To view the plain date as stored, use an explicit cast in your `SELECT` statement:
```sql
SELECT transaction_date::text, ...
FROM transactions;
```
Summary: The stored dates are correct. Always add +1 day to your target date(s) when filtering using the transaction_date column in the WHERE clause.

---------------------------------------------------------------------------------------------

# Data Filtering

```
-- This gives you both the detailed rows AND the summary statistics
---- WORKING AND FUNCTIONAL SALES RETRIEVAL FOR ONLINE DATA
SELECT 
    c.first_name, 
    c.last_name,
    o.total_price, 
    o.site_id,
    TO_TIMESTAMP(o.ready_at_time::bigint) AS utc_time,
    (TO_TIMESTAMP(o.ready_at_time::bigint) + INTERVAL '11 hours') AS aedt_time,
    COUNT(*) OVER (PARTITION BY o.site_id) AS number_of_orders,
    SUM(o.total_price) OVER (PARTITION BY o.site_id) AS total_cost,
    AVG(o.total_price) OVER (PARTITION BY o.site_id) AS average_spend
FROM bite_orders o
JOIN bite_customers c ON o.customer_email = c.email
WHERE o.site_id = '641'
  AND (TO_TIMESTAMP(o.ready_at_time::bigint) + INTERVAL '11 hours') >= '2025-01-01 00:00:00'
  AND (TO_TIMESTAMP(o.ready_at_time::bigint) + INTERVAL '11 hours') < '2025-02-01 00:00:00'
ORDER BY aedt_time DESC;

---------------------------------------------------------------------------------------------

-- WORKING AND FUNCTIONAL SALES RETRIEVAL FOR IN STORE DATA
SELECT 
    COUNT(*) AS transaction_count,
    SUM(total_amount) AS total_sales,
    SUM(discount_value) AS total_discounts,
    SUM(service_charge) AS total_service_charges,
    SUM(gratuity) AS total_gratuity,
    AVG(total_amount) AS average_sale
FROM 
    transactions
WHERE 
    transaction_date BETWEEN '2025-01-01' AND '2025-01-31'
    AND store_id = 'wagga'; -- Change to preston for preston data 
    
------------------------------------------------------------------------------------------------

-- WORKING COMBINATION OF IN STORE AND ONLINE SALES
WITH combined_sales AS (
    -- Online sales from bite_orders
    SELECT 
        'Online' AS sale_type,
        TO_TIMESTAMP(o.ready_at_time::bigint) + INTERVAL '11 hours' AS sale_datetime,
        o.total_price AS sale_amount
    FROM 
        bite_orders o
    WHERE 
        o.site_id = '641'  -- Change this to '641' for Wagga Wagga or '1837' for Preston
        AND (TO_TIMESTAMP(o.ready_at_time::bigint) + INTERVAL '11 hours') 
            BETWEEN '2025-01-01 00:00:00' AND '2025-01-31 23:59:59'

    UNION ALL

    -- In-store sales from transactions
    SELECT 
        'In-store' AS sale_type,
        transaction_date AS sale_datetime,
        total_amount AS sale_amount
    FROM 
        transactions
    WHERE 
        transaction_date BETWEEN '2025-01-01 00:00:00' AND '2025-01-31 23:59:59'
)

-- Summary statistics
SELECT 
    sale_type,
    COUNT(*) AS transaction_count,
    SUM(sale_amount) AS total_sales,
    AVG(sale_amount) AS average_sale
FROM 
    combined_sales
GROUP BY 
    sale_type

UNION ALL

-- Grand total
SELECT 
    'Total' AS sale_type,
    COUNT(*) AS transaction_count,
    SUM(sale_amount) AS total_sales,
    AVG(sale_amount) AS average_sale
FROM 
    combined_sales;
```

# Sites

1837 - Preson
641 - Wagga Wagga 

## Only 2 files really matter.

- monthly_data_workflow.py
- add_month_to_db.py

### monthly_data_workflow.py

This file, given a start and end date, retrievs sales for this period from the epos API, writes all this data to the all_transactions.json file and then reads from the json file and adds to the data to the db

### add_month_to_db.py

If the uploading of data from the monthly_data_workflow.py file is disrupted, we now have data in the all_transactions.json file that needs to be uploaded to the db.

This file, given a start point in the json file, starts from there and uploads the data in the json file to the db.



Add this functionality where you check if a token is valid before doing something. If invalid, get a new token. 
-  more info here - https://developer.deputy.com/deputy-docs/docs/using-oauth-20
![image](image.png)



# Transactions Database Schema - In store sales data

## Table: transactions

```sql
CREATE TABLE transactions (
    id BIGINT PRIMARY KEY,
    customer_id INT,
    staff_id INT,
    device_id INT,
    device_name VARCHAR(50),
    transaction_date DATE,
    transaction_time TIME,
    day_of_week INT,
    week_of_year INT,
    month INT,
    year INT,
    status_id INT,
    barcode VARCHAR(100),
    service_type INT,
    total_amount DECIMAL(10, 2),
    service_charge DECIMAL(10, 2),
    gratuity DECIMAL(10, 2),
    discount_value DECIMAL(10, 2),
    non_discountable DECIMAL(10, 2),
    non_tax DECIMAL(10, 2),
    discount_reason_id INT,
    reference_code VARCHAR(100),
    store_id VARCHAR(50)
);
```

## Table: transaction_items

```sql
CREATE TABLE transaction_items (
    id BIGINT PRIMARY KEY,
    transaction_id BIGINT,
    product_id INT,
    unit_price DECIMAL(10, 2),
    unit_price_exc_tax DECIMAL(10, 2),
    cost_price DECIMAL(10, 2),
    tax_amount DECIMAL(10, 2),
    quantity INT,
    discount_amount DECIMAL(10, 2),
    is_tax_exempt BOOLEAN,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id)
);
```

## Table: multiple_choice_items

```sql
CREATE TABLE multiple_choice_items (
    id BIGINT PRIMARY KEY,
    transaction_item_id BIGINT,
    product_id INT,
    unit_price DECIMAL(10, 2),
    unit_price_exc_tax DECIMAL(10, 2),
    cost_price DECIMAL(10, 2),
    tax_amount DECIMAL(10, 2),
    quantity INT,
    FOREIGN KEY (transaction_item_id) REFERENCES transaction_items(id)
);
```

## Table: tenders

```sql
CREATE TABLE tenders (
    id SERIAL PRIMARY KEY,
    transaction_id BIGINT,
    tender_type_id INT,
    amount DECIMAL(10, 2),
    change_given DECIMAL(10, 2),
    is_cashback BOOLEAN,
    type VARCHAR(50),
    platform_fees DECIMAL(10, 2),
    last4 VARCHAR(4),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id)
);
```

## Table: taxes

```sql
CREATE TABLE taxes (
    id SERIAL PRIMARY KEY,
    transaction_id BIGINT,
    tax_rate_id INT,
    name VARCHAR(50),
    rate DECIMAL(5, 2),
    amount DECIMAL(10, 2),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id)
);
```

# Bite Database Schema - Online sales data

## Table: bite_orders

```sql
CREATE TABLE public.bite_orders (
    order_id VARCHAR(300) PRIMARY KEY,
    site_id VARCHAR(50),
    customer_email VARCHAR(255),
    order_type VARCHAR(50),
    make_type VARCHAR(50),
    sub_total NUMERIC(10, 2),
    total_price NUMERIC(10, 2) NOT NULL,
    delivery_fee NUMERIC(10, 2),
    loyalty_points INTEGER,
    credit NUMERIC(10, 2),
    promotion_points INTEGER,
    item_count INTEGER NOT NULL,
    notes TEXT,
    ready_at_time BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Constraints
ALTER TABLE public.bite_orders ADD CONSTRAINT bite_orders_pkey PRIMARY KEY (order_id);
ALTER TABLE public.bite_orders ADD CONSTRAINT bite_orders_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.bite_sites (site_id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.bite_orders ADD CONSTRAINT bite_orders_customer_email_fkey FOREIGN KEY (customer_email) REFERENCES public.bite_customers (email) ON UPDATE NO ACTION ON DELETE NO ACTION;

-- Indexes
CREATE UNIQUE INDEX bite_orders_pkey USING BTREE (order_id);
CREATE INDEX idx_bite_orders_customer_email USING BTREE (customer_email);
CREATE INDEX idx_bite_orders_site_id USING BTREE (site_id);
CREATE INDEX idx_bite_orders_created_at USING BTREE (created_at);
```

## Table: bite_order_items

```sql
CREATE TABLE public.bite_order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id VARCHAR(300),
    product_id INTEGER NOT NULL,
    variation_id INTEGER,
    category_id INTEGER,
    name VARCHAR(255) NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    quantity INTEGER NOT NULL,
    notes TEXT,
    line_price NUMERIC(10, 2) NOT NULL
);

-- Constraints
ALTER TABLE public.bite_order_items ADD CONSTRAINT bite_order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.bite_orders (order_id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.bite_order_items ADD CONSTRAINT bite_order_items_pkey PRIMARY KEY (id);

-- Indexes
CREATE UNIQUE INDEX bite_order_items_pkey USING BTREE (id);
CREATE INDEX idx_bite_order_items_order_id USING BTREE (order_id);
```

## Table: bite_item_modifiers

```sql
CREATE TABLE public.bite_item_modifiers (
    id BIGSERIAL PRIMARY KEY,
    order_item_id BIGINT,
    modifier_id INTEGER,
    modifier_list_id INTEGER,
    name VARCHAR(255),
    quantity INTEGER,
    price NUMERIC(10, 2)
);

-- Constraints
ALTER TABLE public.bite_item_modifiers ADD CONSTRAINT bite_item_modifiers_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.bite_order_items (id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE public.bite_item_modifiers ADD CONSTRAINT bite_item_modifiers_pkey PRIMARY KEY (id);

-- Indexes
CREATE UNIQUE INDEX bite_item_modifiers_pkey USING BTREE (id);
CREATE INDEX idx_bite_item_modifiers_order_item_id USING BTREE (order_item_id);
```

## Table: bite_customers

```sql
CREATE TABLE public.bite_customers (
    email VARCHAR(255) PRIMARY KEY,
    customer_id BIGINT,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(50) NOT NULL
);

-- Constraints
ALTER TABLE public.bite_customers ADD CONSTRAINT bite_customers_pkey PRIMARY KEY (email);

-- Indexes
CREATE UNIQUE INDEX bite_customers_pkey USING BTREE (email);
```

## Table: bite_sites

```sql
CREATE TABLE public.bite_sites (
    site_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100)
);

-- Constraints
ALTER TABLE public.bite_sites ADD CONSTRAINT bite_sites_pkey PRIMARY KEY (site_id);

-- Indexes
CREATE UNIQUE INDEX bite_sites_pkey USING BTREE (site_id);
```