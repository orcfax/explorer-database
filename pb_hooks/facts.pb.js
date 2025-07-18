/// <reference path="../pb_data/types.d.ts" />

// Custom API endpoint for getting paginated facts
routerAdd("GET", "/api/explorer/facts/{networkId}", (e) => {
    const { dbUtils } = require(`${__hooks}/utils.pb.js`);
    const networkId = e.request.pathValue("networkId");
    const page = parseInt(e.request.url.query().get("page") || "1");
    const feedId = e.request.url.query().get("feedId");
    const limit = 5;

    try {
        const facts = $app.findRecordsByFilter(
            "facts",
            `network = {:networkId} ${feedId ? `&& feed = {:feedId}` : ""}`,
            "-validation_date",
            page,
            limit,
            { networkId: networkId, feedId: feedId }
        );

        const totalFacts = $app.countRecords(
            "facts",
            $dbx.and(
                $dbx.exp(`network = {:networkId}`, {
                    networkId: networkId,
                }),
                feedId ? $dbx.exp(`feed = {:feedId}`, { feedId: feedId }) : null
            )
        );
        const totalPages = Math.ceil(totalFacts / limit);

        const factsWithFeeds = [];

        for (let i = 0; i < facts.length; i++) {
            const fact = facts[i];

            // Get the feed for this fact
            const feedRecord = $app.findRecordById("feeds", fact.get("feed"));
            $app.expandRecord(feedRecord, ["base_asset", "quote_asset"], null);

            // Get participating nodes if any
            const participatingNodeIds = fact.get("participating_nodes") || [];
            let participatingNodes = [];
            if (participatingNodeIds.length > 0) {
                participatingNodes = participatingNodeIds
                    .map((nodeId) => {
                        try {
                            const node = $app.findRecordById("nodes", nodeId);
                            return {
                                id: node.id,
                                node_urn: node.get("node_urn"),
                                network: node.get("network"),
                                status: node.get("status"),
                                type: node.get("type"),
                                name: node.get("name"),
                                address_locality: node.get("address_locality"),
                                address_region: node.get("address_region"),
                                geo_coordinates: node.get("geo_coordinates"),
                            };
                        } catch (e) {
                            return null;
                        }
                    })
                    .filter((node) => node !== null);
            }

            const feedWithAssets = dbUtils.buildFeedObject(feedRecord);

            factsWithFeeds.push({
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
                participating_nodes: participatingNodes,
                storage_cost: fact.get("storage_cost"),
                sources: fact.get("sources") || [],
                content_signature: fact.get("content_signature"),
                collection_date: fact.get("collection_date"),
                is_archive_indexed: fact.get("is_archive_indexed"),
            });
        }

        return e.json(200, {
            facts: factsWithFeeds,
            totalPages: totalPages,
            totalFacts: totalFacts,
        });
    } catch (error) {
        console.log("Facts API error:", error);
        return e.json(500, { error: "Failed to fetch facts data" });
    }
});

// Custom API endpoint for getting a specific fact by URN
routerAdd("GET", "/api/explorer/facts/{networkId}/{factUrn}", (e) => {
    const { dbUtils } = require(`${__hooks}/utils.pb.js`);
    const networkId = e.request.pathValue("networkId");
    const factUrn = e.request.pathValue("factUrn");
    const feedId = e.request.url.query().get("feedId");

    try {
        const facts = $app.findRecordsByFilter(
            "facts",
            `fact_urn = {:factUrn} && network = {:networkId} ${feedId ? `&& feed = {:feedId}` : ""}`,
            "-validation_date",
            1,
            1,
            {
                factUrn: factUrn,
                networkId: networkId,
                feedId: feedId,
            }
        );

        if (facts.length === 0) {
            return e.json(404, { error: "Fact not found" });
        }

        const fact = facts[0];

        // Get the feed for this fact
        const feedRecord = $app.findRecordById("feeds", fact.get("feed"));
        $app.expandRecord(feedRecord, ["base_asset", "quote_asset"], null);

        const feedWithAssets = dbUtils.buildFeedObject(feedRecord);

        const factWithFeed = {
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
        };

        return e.json(200, factWithFeed);
    } catch (error) {
        console.log("Fact by URN API error:", error);
        return e.json(500, { error: "Failed to fetch fact by URN" });
    }
});
