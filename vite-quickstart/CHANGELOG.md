# Changelog

This file documents the recent changes and features implemented in the dashboard application.

## [Unreleased] - 2024-07-10

### Added

*   **Date Range Picker:** Implemented a single date range selector in the top navigation bar (`AppTopbar.vue`).
    *   Uses PrimeVue `Calendar` component with `selectionMode="range"`.
    *   Defaults to displaying the last 7 days upon initial load (`App.vue`).
*   **Revenue Source Filter:** Added a dropdown in the top navigation bar (`AppTopbar.vue`) to filter revenue by source (`All`, `In Store`, `Bite`).
*   **Backend Date Filtering:** The `/api/total-revenue` endpoint now accepts `startDate` and `endDate` (YYYY-MM-DD) query parameters to filter revenue calculations.
*   **Backend Source Filtering:** The `/api/total-revenue` endpoint now accepts a `source` query parameter (`All`, `In Store`, `Bite`) and conditionally executes the appropriate database queries.
*   **Separate Revenue Queries:** Backend revenue calculation logic was refactored to use two distinct queries:
    *   One query sums `total_amount` from the `transactions` table (in-store), filtering by `transaction_date` and `transaction_time`.
    *   A second query sums `total_price` from the `bite_orders` table (online), filtering by `ready_at_time` using epoch timestamps derived from the date range.
    *   The results of these two queries are summed to provide the final `totalRevenue`.
*   **Dependency:** Added `date-fns` for frontend date formatting (`StatsWidget.vue`).
*   **Logging:** Added more detailed logging to the backend API endpoint.
*   **Top Selling Products Widget:**
    *   Replaced static `RecentActivityWidget` with dynamic `TopProductsWidget`.
    *   Created backend API endpoint (`/api/top-products`) to fetch aggregated product sales data from `bite_order_items` (online) and `transaction_items` (in-store).
    *   Handles filtering by store, date range, and revenue source (All, In Store, Bite).
    *   Displays Product Identifier (Name for online, ID for in-store - awaiting mapping), Quantity Sold, and Total Revenue.
    *   Uses PrimeVue `DataTable` with dynamic columns.

### Changed

*   Removed separate Start Date and End Date inputs from the UI.
*   Updated state management in `App.vue` to use a `dateRange` array instead of separate `startDate` and `endDate`.
*   Added state management in `App.vue` for `selectedRevenueSource`.
*   Updated `AppTopbar.vue` props and emits for `selectedRevenueSource`.
*   Updated `StatsWidget.vue` to accept the `selectedRevenueSource` prop, include it in API calls, and update its watcher.
*   Updated `StatsWidget.vue` subtitle to include the selected revenue source.
*   Backend revenue calculation no longer uses `UNION ALL`.
*   Renamed `src/components/dashboard/ProductOverviewWidget.vue` to `src/components/dashboard/TopProductsWidget.vue`.
*   Adjusted layout in `src/App.vue` to place `SalesTrendWidget` and `TopProductsWidget` side-by-side in a row.
*   Added vertical spacing between dashboard widgets in `src/App.vue` using margins.
*   Adjusted layout in `src/App.vue` to stack `TopProductsWidget`, `SalesTrendWidget`, and `PeakTimeWidget` vertically, spanning the full width of the main content area. Increased the minimum height of these widgets for better data presentation.

### Fixed

*   Resolved discrepancy where the revenue widget initially showed all-time revenue instead of the default last 7 days, by implementing backend date filtering.
*   Corrected SQL syntax error in the backend `/api/total-revenue` endpoint related to parameter casting for timestamp comparisons (`EXTRACT(EPOCH FROM $1::timestamp)`).
*   Resolved "Maximum recursive updates exceeded" error in `TopProductsWidget` by simplifying `DataTable` configuration and data handling. **Note:** This error reappeared after backend changes to load product details from JSON and preprocess data (`/api/top-products` returning `name`, `salePrice`, `costPrice`, etc.). Attempts to fix the new instance included:
    *   Removing `scrollHeight="flex"` from `<DataTable>`.
    *   Removing fixed height and deep scroll styles from the component.
    *   Removing the `scrollable` prop from `<DataTable>`.
    *   Changing `columns` definition from `ref` to `const`.
    *   Refactoring column body rendering from conditional templates to a single template with internal conditions.
    *   Changing the watcher from `deep: true` on `props.dateRange` to watching a computed primitive key (`dateRangeKey`).
    *   Changing from dynamic column generation (`v-for`) to static `<Column>` definitions.
*   Fixed backend SQL parameter error ("could not determine data type") in `/api/top-products` by correctly matching query parameters.
*   Corrected initial date validation failure in `/api/top-products`.
*   Fixed Vite build error by removing unused `ProductOverviewWidget` import/usage.
*   Fixed date handling discrepancy in backend queries where order counts were off by one day due to incorrect date range handling:
    *   Removed `addDays` helper function and date adjustment logic from all backend API endpoints
    *   Updated SQL queries to use inclusive date ranges (`>= startDate AND <= endDate`) for `transaction_date` fields
    *   Affected endpoints: `/api/total-revenue`, `/api/total-orders`, `/api/sales-trend`, `/api/top-products`, `/api/sales-activity`
    *   This ensures that order counts match the EposNow system's data for specific dates 