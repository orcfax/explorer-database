/// <reference path="../pb_data/types.d.ts" />

// Custom API endpoint for sources with metadata
routerAdd("GET", "/api/explorer/sources/{networkId}", (e) => {
    const { dbUtils } = require(`${__hooks}/utils.pb.js`);
    const networkId = e.request.pathValue("networkId");

    try {
        const sources = $app.findRecordsByFilter(
            "sources",
            `network = {:networkId} && status = "active"`,
            "-updated",
            0,
            0,
            { networkId: networkId }
        );

        const sourcesWithMetadata = [];

        for (let i = 0; i < sources.length; i++) {
            const source = sources[i];

            // Get fact metadata for this source
            const facts = $app.findRecordsByFilter(
                "facts",
                `network = {:networkId} && sources ~ "${source.id}"`,
                "-validation_date",
                1,
                1,
                { networkId: networkId }
            );

            const totalFacts = $app.countRecords(
                "facts",
                $dbx.and(
                    $dbx.exp(`network = {:networkId}`, { networkId: networkId }),
                    $dbx.like(`sources`, [source.id])
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

            sourcesWithMetadata.push({
                id: source.id,
                name: source.get("name"),
                network: source.get("network"),
                recipient: source.get("recipient"),
                sender: source.get("sender"),
                type: source.get("type"),
                website: source.get("website"),
                image_path: source.get("image_path"),
                background_color: source.get("background_color"),
                baseAssetValue: undefined,
                quoteAssetValue: undefined,
                assetPairValue: undefined,
                totalFacts,
                latestFact: latestFact && feed ? dbUtils.buildFactObject(latestFact, feed) : null,
            });
        }

        return e.json(200, sourcesWithMetadata);
    } catch (error) {
        console.log("Sources API error:", error);
        return e.json(500, { error: "Failed to fetch sources data" });
    }
});
