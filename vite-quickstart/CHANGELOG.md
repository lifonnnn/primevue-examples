# Changelog

This file documents the recent changes and features implemented in the dashboard application.

## [Unreleased] - YYYY-MM-DD (Replace Date)

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

### Changed

*   Removed separate Start Date and End Date inputs from the UI.
*   Updated state management in `App.vue` to use a `dateRange` array instead of separate `startDate` and `endDate`.
*   Added state management in `App.vue` for `selectedRevenueSource`.
*   Updated `AppTopbar.vue` props and emits for `selectedRevenueSource`.
*   Updated `StatsWidget.vue` to accept the `selectedRevenueSource` prop, include it in API calls, and update its watcher.
*   Updated `StatsWidget.vue` subtitle to include the selected revenue source.
*   Backend revenue calculation no longer uses `UNION ALL`.

### Fixed

*   Resolved discrepancy where the revenue widget initially showed all-time revenue instead of the default last 7 days, by implementing backend date filtering.
*   Corrected SQL syntax error in the backend `/api/total-revenue` endpoint related to parameter casting for timestamp comparisons (`EXTRACT(EPOCH FROM $1::timestamp)`). 