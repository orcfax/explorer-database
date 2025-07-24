/// <reference path="../pb_data/types.d.ts" />

// Custom API endpoint for getting statistics per feed with flexible intervals
routerAdd("GET", "/api/explorer/stats", (e) => {
    const { dateUtils } = require(`${__hooks}/utils.pb.js`);

    try {
        // Get query parameters
        const networkName = e.request.url.query().get("network");
        const interval = e.request.url.query().get("interval");
        const start = e.request.url.query().get("start");
        const end = e.request.url.query().get("end");

        // Validate required parameters
        if (!networkName) {
            return e.json(400, {
                error: "Missing required 'network' parameter. Must be 'Mainnet' or 'Preview'.",
            });
        }
        if (!interval) {
            return e.json(400, {
                error: "Missing required 'interval' parameter. Must be 'month', 'week', or 'year'.",
            });
        }
        if (!start) {
            return e.json(400, {
                error: "Missing required 'start' parameter. Must be in YYYY-MM-DD format.",
            });
        }

        // Validate parameter values
        if (!["Mainnet", "Preview"].includes(networkName)) {
            return e.json(400, {
                error: "Invalid 'network' parameter. Must be 'Mainnet' or 'Preview'.",
            });
        }
        if (!["month", "week", "year"].includes(interval)) {
            return e.json(400, {
                error: "Invalid 'interval' parameter. Must be 'month', 'week', or 'year'.",
            });
        }

        // Validate date format (basic check)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(start)) {
            return e.json(400, { error: "Invalid 'start' date format. Must be YYYY-MM-DD." });
        }
        if (end && !dateRegex.test(end)) {
            return e.json(400, { error: "Invalid 'end' date format. Must be YYYY-MM-DD." });
        }

        // Get network record by name
        const networks = arrayOf(
            new DynamicModel({
                id: "",
                name: "",
            })
        );

        $app.db()
            .select("id", "name")
            .from("Networks")
            .where($dbx.exp("name = {:networkName}", { networkName }))
            .all(networks);

        if (networks.length === 0) {
            return e.json(404, { error: `Network '${networkName}' not found.` });
        }

        const networkRecord = networks[0];
        const networkId = networkRecord.id;

        // Set end date to current date if not provided
        const endDate = end || dateUtils.formatDate(new Date(), "yyyy-MM-dd");

        // Build SQL query based on interval type
        let intervalSelect, intervalGroup, labelFormat;

        switch (interval) {
            case "month":
                intervalSelect = `
                    CAST(strftime('%Y', f.publication_date) AS INTEGER) as interval_year,
                    CAST(strftime('%m', f.publication_date) AS INTEGER) as interval_month,
                    strftime('%Y-%m', f.publication_date) as interval_label,
                    date(strftime('%Y-%m-01', f.publication_date)) as interval_start,
                    date(strftime('%Y-%m-01', f.publication_date), '+1 month', '-1 day') as interval_end
                `;
                intervalGroup = "interval_year, interval_month";
                break;
            case "week":
                intervalSelect = `
                    CAST(strftime('%Y', f.publication_date) AS INTEGER) as interval_year,
                    CAST(strftime('%W', f.publication_date) AS INTEGER) as interval_week,
                    strftime('%Y-W%W', f.publication_date) as interval_label,
                    date(f.publication_date, 'weekday 0', '-6 days') as interval_start,
                    date(f.publication_date, 'weekday 0') as interval_end
                `;
                intervalGroup = "interval_year, interval_week";
                break;
            case "year":
                intervalSelect = `
                    CAST(strftime('%Y', f.publication_date) AS INTEGER) as interval_year,
                    NULL as interval_month,
                    strftime('%Y', f.publication_date) as interval_label,
                    date(strftime('%Y-01-01', f.publication_date)) as interval_start,
                    date(strftime('%Y-12-31', f.publication_date)) as interval_end
                `;
                intervalGroup = "interval_year";
                break;
        }

        // Query to get statistics grouped by feed and interval
        const statsSQL = `
            SELECT 
                fd.feed_id,
                ${intervalSelect},
                COUNT(*) as fact_count,
                COUNT(DISTINCT f.transaction_id) as tx_count
            FROM Facts f
            INNER JOIN Feeds fd ON f.feed = fd.id
            WHERE f.network = {:networkId}
                AND DATE(f.publication_date) >= {:start}
                AND DATE(f.publication_date) <= {:endDate}
            GROUP BY fd.feed_id, ${intervalGroup}
            ORDER BY fd.feed_id, interval_start
        `;

        const intervalStats = arrayOf(
            new DynamicModel({
                feed_id: "",
                interval_year: 0,
                interval_month: 0,
                interval_week: 0,
                interval_label: "",
                interval_start: "",
                interval_end: "",
                fact_count: 0,
                tx_count: 0,
            })
        );

        $app.db()
            .newQuery(statsSQL)
            .bind({
                networkId,
                start: start + " 00:00:00.000Z",
                endDate: endDate + " 23:59:59.999Z",
            })
            .all(intervalStats);

        // Get overall totals
        const totalSQL = `
            SELECT 
                COUNT(*) as total_facts,
                COUNT(DISTINCT transaction_id) as total_txs
            FROM Facts f
            WHERE f.network = {:networkId}
                AND DATE(f.publication_date) >= {:start}
                AND DATE(f.publication_date) <= {:endDate}
        `;

        const totals = arrayOf(
            new DynamicModel({
                total_facts: 0,
                total_txs: 0,
            })
        );

        $app.db()
            .newQuery(totalSQL)
            .bind({
                networkId,
                start: start + " 00:00:00.000Z",
                endDate: endDate + " 23:59:59.999Z",
            })
            .all(totals);

        // Transform data to organize by feed
        const feedStatsMap = {};

        intervalStats.forEach((stat) => {
            if (!feedStatsMap[stat.feed_id]) {
                feedStatsMap[stat.feed_id] = {
                    feed_id: stat.feed_id,
                    totalFacts: 0,
                    totalTxs: 0,
                    intervals: [],
                };
            }

            feedStatsMap[stat.feed_id].intervals.push({
                type: interval,
                start: stat.interval_start,
                end: stat.interval_end,
                label: stat.interval_label,
                totalFacts: stat.fact_count,
                totalTxs: stat.tx_count,
            });

            feedStatsMap[stat.feed_id].totalFacts += stat.fact_count;
            feedStatsMap[stat.feed_id].totalTxs += stat.tx_count;
        });

        // Build final response
        const response = {
            all: {
                start: start,
                end: endDate,
                totalFacts: totals.length > 0 ? totals[0].total_facts : 0,
                totalTxs: totals.length > 0 ? totals[0].total_txs : 0,
            },
            feeds: Object.values(feedStatsMap),
        };

        return e.json(200, response);
    } catch (error) {
        console.log("Stats API error:", error);
        return e.json(500, { error: "Failed to fetch statistics data" });
    }
});
