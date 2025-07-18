/// <reference path="../pb_data/types.d.ts" />

// Custom API endpoint for nodes with metadata
routerAdd("GET", "/api/explorer/nodes/{networkId}", (e) => {
    const { dbUtils } = require(`${__hooks}/utils.pb.js`);
    const networkId = e.request.pathValue("networkId");

    try {
        const nodes = $app.findRecordsByFilter(
            "nodes",
            `network = {:networkId}`,
            "-updated",
            0,
            0,
            { networkId: networkId }
        );

        const nodesWithMetadata = [];

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];

            // Get fact metadata for this node
            const facts = $app.findRecordsByFilter(
                "facts",
                `network = {:networkId} && participating_nodes ~ {:nodeId}`,
                "-validation_date",
                1,
                1,
                { networkId: networkId, nodeId: node.id }
            );

            const totalFacts = $app.countRecords(
                "facts",
                $dbx.and(
                    $dbx.exp(`network = {:networkId}`, { networkId: networkId }),
                    $dbx.like(`participating_nodes`, [node.id])
                )
            );

            const latestFact = facts.length > 0 ? facts[0] : null;
            let feed = null;
            if (latestFact) {
                $app.expandRecord(latestFact, ["feed"], null);
                const expandedFeed = latestFact.expandedOne("feed");
                $app.expandRecord(expandedFeed, ["base_asset", "quote_asset"], null);
                feed = dbUtils.buildFeedObject(expandedFeed);
            }

            nodesWithMetadata.push({
                id: node.id,
                node_urn: node.get("node_urn"),
                network: node.get("network"),
                status: node.get("status"),
                type: node.get("type"),
                name: node.get("name"),
                address_locality: node.get("address_locality") || undefined,
                address_region: node.get("address_region") || undefined,
                geo_coordinates: node.get("geo_coordinates") || undefined,
                totalFacts,
                latestFact: latestFact && feed ? dbUtils.buildFactObject(latestFact, feed) : null,
            });
        }

        return e.json(200, nodesWithMetadata);
    } catch (error) {
        console.log("Nodes API error:", error);
        return e.json(500, { error: "Failed to fetch nodes data" });
    }
});
