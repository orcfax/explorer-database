/// <reference path="../pb_data/types.d.ts" />

// Custom API endpoint for feeds with optimized data loading
routerAdd("GET", "/api/explorer/feeds/{networkId}", (e) => {
    const { dbUtils } = require(`${__hooks}/utils.pb.js`);
    const networkId = e.request.pathValue("networkId");

    try {
        // Get all feeds with expanded relations
        const feeds = $app.findRecordsByFilter(
            "feeds",
            `network = {:networkId}`,
            "-updated",
            0,
            0,
            {
                networkId: networkId,
            }
        );

        const feedsWithData = [];

        for (let i = 0; i < feeds.length; i++) {
            const feed = feeds[i];
            $app.expandRecord(feed, ["base_asset", "quote_asset"], null);

            // Get latest fact for this feed
            const latestFacts = $app.findRecordsByFilter(
                "facts",
                `network = {:networkId} && feed = {:feedId}`,
                "-validation_date",
                1,
                1,
                { networkId: networkId, feedId: feed.id }
            );

            const latestFact = latestFacts.length > 0 ? latestFacts[0] : null;
            const totalFacts = $app.countRecords(
                "facts",
                $dbx.and(
                    $dbx.exp(`network = {:networkId}`, { networkId: networkId }),
                    $dbx.exp(`feed = {:feedId}`, { feedId: feed.id })
                )
            );

            // Get historical values using utility function
            const historical = dbUtils.getHistoricalValues(networkId, feed.id);

            // Include ALL properties to match DBFeedWithData structure
            feedsWithData.push({
                // Base feed properties
                id: feed.id,
                feed_id: feed.get("feed_id"),
                network: feed.get("network"),
                type: feed.get("type"),
                name: feed.get("name"),
                version: feed.get("version"),
                status: feed.get("status"),
                inactive_reason: feed.get("inactive_reason"),
                source_type: feed.get("source_type"),
                funding_type: feed.get("funding_type"),
                calculation_method: feed.get("calculation_method"),
                heartbeat_interval: feed.get("heartbeat_interval"),
                deviation: feed.get("deviation"),

                // Expanded asset properties
                base_asset: dbUtils.buildAssetObject(feed.expandedOne("base_asset")),
                quote_asset: dbUtils.buildAssetObject(feed.expandedOne("quote_asset")),

                // Latest fact with complete structure
                latestFact: dbUtils.buildFactObject(latestFact),

                // Metadata
                totalFacts,
                type_description: "Current Exchange Rate",
                type_description_short: "CER",

                // Historical values
                ...historical,
            });
        }

        return e.json(200, feedsWithData);
    } catch (error) {
        console.log("Feeds API error:", error);
        return e.json(500, { error: "Failed to fetch feeds data" });
    }
});

// Custom API endpoint for getting a specific feed by ID
routerAdd("GET", "/api/explorer/feeds/{networkId}/{feedId}", (e) => {
    const { dbUtils } = require(`${__hooks}/utils.pb.js`);
    const networkId = e.request.pathValue("networkId");
    const feedId = decodeURIComponent(e.request.pathValue("feedId"));

    try {
        // Clean up feedId - remove any trailing "/facts/undefined"
        const cleanFeedId = feedId.replace(/\/facts\/undefined$/, "");

        const feedRecords = $app.findRecordsByFilter(
            "feeds",
            `network = {:networkId} && feed_id ~ {:feedId}`,
            "-updated",
            1,
            1,
            { networkId: networkId, feedId: cleanFeedId }
        );

        if (feedRecords.length === 0) {
            return e.json(404, { error: "Feed not found" });
        }

        const feedRecord = feedRecords[0];
        $app.expandRecord(feedRecord, ["base_asset", "quote_asset"], null);

        // Get latest fact for this feed
        const latestFacts = $app.findRecordsByFilter(
            "facts",
            `network = {:networkId} && feed = {:feedRecordId}`,
            "-validation_date",
            1,
            1,
            { networkId: networkId, feedRecordId: feedRecord.id }
        );

        const latestFact = latestFacts.length > 0 ? latestFacts[0] : null;
        const totalFacts = $app.countRecords(
            "facts",
            $dbx.and(
                $dbx.exp(`network = {:networkId}`, { networkId: networkId }),
                $dbx.exp(`feed = {:feedRecordId}`, { feedRecordId: feedRecord.id })
            )
        );

        // Get historical values using utility function
        const historicalValues = dbUtils.getHistoricalValues(networkId, feedRecord.id);

        const feedWithData = {
            id: feedRecord.id,
            feed_id: feedRecord.get("feed_id"),
            network: feedRecord.get("network"),
            type: feedRecord.get("type"),
            name: feedRecord.get("name"),
            version: feedRecord.get("version"),
            status: feedRecord.get("status"),
            inactive_reason: feedRecord.get("inactive_reason"),
            source_type: feedRecord.get("source_type"),
            funding_type: feedRecord.get("funding_type"),
            calculation_method: feedRecord.get("calculation_method"),
            heartbeat_interval: feedRecord.get("heartbeat_interval"),
            deviation: feedRecord.get("deviation"),
            base_asset: dbUtils.buildAssetObject(feedRecord.expandedOne("base_asset")),
            quote_asset: dbUtils.buildAssetObject(feedRecord.expandedOne("quote_asset")),
            latestFact: dbUtils.buildFactObject(latestFact),
            totalFacts: totalFacts,
            type_description: "Current Exchange Rate",
            type_description_short: "CER",
            ...historicalValues,
        };

        return e.json(200, feedWithData);
    } catch (error) {
        console.log("Feed by ID API error:", error);
        return e.json(500, { error: "Failed to fetch feed data" });
    }
});

// Custom API endpoint for getting feed facts by date range
routerAdd("GET", "/api/explorer/feeds/{networkId}/{feedId}/facts", (e) => {
    const { dateUtils, dbUtils } = require(`${__hooks}/utils.pb.js`);
    const networkId = e.request.pathValue("networkId");
    const feedId = decodeURIComponent(e.request.pathValue("feedId"));
    const rangeOfDays = parseInt(e.request.url.query().get("range") || "1");
    const startDate = decodeURIComponent(e.request.url.query().get("startDate"));

    try {
        // Get the feed record to get the internal ID
        const feedRecords = $app.findRecordsByFilter(
            "feeds",
            `network = {:networkId} && feed_id ~ {:feedId}`,
            "-updated",
            1,
            1,
            { networkId: networkId, feedId: feedId }
        );

        if (feedRecords.length === 0) {
            return e.json(404, { error: "Feed not found" });
        }

        const feedRecord = feedRecords[0];

        // Calculate date range
        const start = startDate ? new Date(startDate) : new Date();
        const endDate = dateUtils.subtractDays(start, rangeOfDays - 1);
        const endDateFilter = dateUtils.formatDate(endDate, "yyyy-MM-dd");

        const facts = $app.findRecordsByFilter(
            "facts",
            `network = {:networkId} && feed = {:feedRecordId} && validation_date > {:endDate}`,
            "-validation_date",
            1,
            5000,
            {
                networkId: networkId,
                feedRecordId: feedRecord.id,
                endDate: `${endDateFilter} 00:00:00.000Z`,
            }
        );

        const factsData = facts.map((fact) => dbUtils.buildFactObject(fact));

        return e.json(200, factsData);
    } catch (error) {
        console.log("Feed facts by date range API error:", error);
        return e.json(500, { error: "Failed to fetch feed facts by date range" });
    }
});
