/// <reference path="../pb_data/types.d.ts" />

// Custom API endpoint for unified search across facts and feeds
routerAdd("GET", "/api/explorer/search/{networkId}", (e) => {
    const { dbUtils } = require(`${__hooks}/utils.pb.js`);
    const networkId = e.request.pathValue("networkId");
    const query = e.request.url.query().get("q");

    if (!query) {
        return e.json(400, { error: "Query parameter 'q' is required" });
    }

    try {
        const results = {
            facts: [],
            feeds: [],
        };

        // Search facts
        const facts = $app.findRecordsByFilter(
            "facts",
            `network = {:networkId} && (fact_urn ~ {:query} || storage_urn ~ {:query} || transaction_id ~ {:query} || block_hash ~ {:query})`,
            "-validation_date",
            1,
            50,
            { networkId: networkId, query: query }
        );

        for (let i = 0; i < facts.length; i++) {
            const fact = facts[i];

            // Get the feed for this fact
            const feedRecord = $app.findRecordById("feeds", fact.get("feed"));
            $app.expandRecord(feedRecord, ["base_asset", "quote_asset"], null);

            const feedWithAssets = dbUtils.buildFeedObject(feedRecord);

            results.facts.push({
                id: fact.id,
                network: fact.get("network"),
                policy: fact.get("policy"),
                fact_urn: fact.get("fact_urn"),
                feed: feedWithAssets,
                value: fact.get("value"),
                value_inverse: fact.get("value_inverse"),
                validation_date: fact.get("validation_date"),
                publication_date: fact.get("publication_date"),
                transaction_id: fact.get("transaction_id"),
                storage_urn: fact.get("storage_urn"),
                block_hash: fact.get("block_hash"),
                output_index: fact.get("output_index"),
                address: fact.get("address"),
                slot: fact.get("slot"),
                statement_hash: fact.get("statement_hash"),
                publication_cost: fact.get("publication_cost"),
                participating_nodes: fact.get("participating_nodes") || [],
                storage_cost: fact.get("storage_cost"),
                sources: fact.get("sources") || [],
                content_signature: fact.get("content_signature"),
                collection_date: fact.get("collection_date"),
                is_archive_indexed: fact.get("is_archive_indexed"),
            });
        }

        // Search feeds
        const feeds = $app.findRecordsByFilter(
            "feeds",
            `network = {:networkId} && feed_id ~ {:query}`,
            "-updated",
            1,
            50,
            { networkId: networkId, query: query }
        );

        for (let i = 0; i < feeds.length; i++) {
            const feed = feeds[i];
            $app.expandRecord(feed, ["base_asset", "quote_asset"], null);

            results.feeds.push({
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
                base_asset: dbUtils.buildAssetObject(feed.expandedOne("base_asset")),
                quote_asset: dbUtils.buildAssetObject(feed.expandedOne("quote_asset")),
                type_description: "Current Exchange Rate",
                type_description_short: "CER",
                totalFacts: 0, // Setting to 0 for search results
            });
        }

        return e.json(200, results);
    } catch (error) {
        console.log("Unified search API error:", error);
        return e.json(500, { error: "Failed to perform search" });
    }
});
