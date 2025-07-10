/// <reference path="../pb_data/types.d.ts" />

// Custom API endpoint for dashboard data
routerAdd("GET", "/api/explorer/dashboard/{networkId}", (e) => {
    const networkId = e.request.pathValue("networkId");

    try {
        // Compute dashboard stats
        const today = new Date().toISOString().split("T")[0];

        // Get all counts efficiently
        const totalFacts = $app.countRecords(
            "facts",
            $dbx.exp(`network = {:networkId}`, { networkId: networkId })
        );
        const totalFacts24Hour = $app.countRecords(
            "facts",
            $dbx.and(
                $dbx.exp(`network = {:networkId}`, { networkId: networkId }),
                $dbx.exp(`publication_date >= "{:today} 00:00:00.000Z"`, { today: today })
            )
        );
        const totalActiveFeeds = $app.countRecords(
            "feeds",
            $dbx.hashExp({ network: networkId, status: "active" })
        );
        const activeIncidents = $app.countRecords(
            "rss",
            $dbx.and(
                $dbx.exp(`type = "incident_reports"`, {}),
                $dbx.exp(`status != "resolved"`, {})
            )
        );

        // Get latest network update

        function processBlogDescription(description) {
            // Remove leading figure and image tags
            let processed = description.replace(/^<figure>.*?<\/figure>/, "");
            // Remove leading date paragraph
            processed = processed.replace(/^<p><em>.*?<\/em><\/p>/, "");
            // Get only the first paragraph
            const firstParagraph = processed.match(/<p>.*?<\/p>/);
            return firstParagraph ? firstParagraph[0] : processed;
        }

        const rssRecords = $app.findRecordsByFilter("rss", "", "-publish_date", 1, 1, {});
        const latestNetworkUpdate =
            rssRecords.length > 0
                ? {
                      id: rssRecords[0].id,
                      title: rssRecords[0].get("title"),
                      type: rssRecords[0].get("type"),
                      description:
                          rssRecords[0].get("type") === "blog_posts"
                              ? processBlogDescription(rssRecords[0].get("description"))
                              : rssRecords[0].get("description"),
                      link: rssRecords[0].get("link"),
                      publish_date: rssRecords[0].get("publish_date"),
                      status: rssRecords[0].get("status"),
                  }
                : null;

        // Get all nodes for the network
        const nodes = $app.findRecordsByFilter(
            "nodes",
            `network = {:networkId}`,
            "-updated",
            0,
            0,
            { networkId: networkId }
        );
        const nodesData = nodes.map((node) => ({
            id: node.id,
            node_urn: node.get("node_urn"),
            network: node.get("network"),
            status: node.get("status"),
            type: node.get("type"),
            name: node.get("name"),
        }));

        // Get all sources for the network
        const sources = $app.findRecordsByFilter(
            "sources",
            `network = {:networkId} && status = "active"`,
            "-updated",
            0,
            0,
            { networkId: networkId }
        );
        const sourcesData = sources.map((source) => ({
            id: source.id,
            name: source.get("name"),
            network: source.get("network"),
            type: source.get("type"),
        }));

        return e.json(200, {
            totalFacts,
            totalFacts24Hour,
            totalActiveFeeds,
            activeIncidents,
            latestNetworkUpdate,
            nodes: nodesData,
            sources: sourcesData,
            lastUpdated: new Date().toISOString(),
        });
    } catch (error) {
        console.log("Dashboard API error:", error);
        return e.json(500, { error: "Failed to fetch dashboard data" });
    }
});

// Custom API endpoint for feeds with optimized data loading
routerAdd("GET", "/api/explorer/feeds/{networkId}", (e) => {
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

            // Get historical values - matching the old approach logic
            const now = new Date();
            const isoString = now.toISOString();
            const timeString = isoString.split("T")[1].slice(0, 12) + "Z";

            function getFormattedDateFilter(days) {
                const newDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
                // Format as UTC date string to match old approach
                const year = newDate.getUTCFullYear();
                const month = String(newDate.getUTCMonth() + 1).padStart(2, "0");
                const day = String(newDate.getUTCDate()).padStart(2, "0");
                return `${year}-${month}-${day} ${timeString}`;
            }

            const oneDayAgoFilter = getFormattedDateFilter(1);
            const threeDaysAgoFilter = getFormattedDateFilter(3);
            const sevenDaysAgoFilter = getFormattedDateFilter(7);

            function getNearestValue(date, networkId, feedId) {
                try {
                    const facts = $app.findRecordsByFilter(
                        "facts",
                        `network = {:networkId} && feed = {:feedId} && validation_date <= {:date}`,
                        "-validation_date",
                        1,
                        1,
                        { networkId: networkId, feedId: feedId, date: date }
                    );
                    return facts.length > 0 ? facts[0].get("value") : null;
                } catch (error) {
                    console.log("Error getting historical value:", error);
                    return null;
                }
            }

            const historical = {
                oneDayAgo: getNearestValue(oneDayAgoFilter, networkId, feed.id),
                threeDaysAgo: getNearestValue(threeDaysAgoFilter, networkId, feed.id),
                sevenDaysAgo: getNearestValue(sevenDaysAgoFilter, networkId, feed.id),
            };

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
                base_asset: feed.expandedOne("base_asset")
                    ? {
                          id: feed.expandedOne("base_asset").id,
                          ticker: feed.expandedOne("base_asset").get("ticker"),
                          name: feed.expandedOne("base_asset").get("name"),
                          type: feed.expandedOne("base_asset").get("type"),
                          website: feed.expandedOne("base_asset").get("website"),
                          fingerprint: feed.expandedOne("base_asset").get("fingerprint"),
                          image_path: feed.expandedOne("base_asset").get("image_path"),
                          background_color: feed.expandedOne("base_asset").get("background_color"),
                      }
                    : null,
                quote_asset: feed.expandedOne("quote_asset")
                    ? {
                          id: feed.expandedOne("quote_asset").id,
                          ticker: feed.expandedOne("quote_asset").get("ticker"),
                          name: feed.expandedOne("quote_asset").get("name"),
                          type: feed.expandedOne("quote_asset").get("type"),
                          website: feed.expandedOne("quote_asset").get("website"),
                          fingerprint: feed.expandedOne("quote_asset").get("fingerprint"),
                          image_path: feed.expandedOne("quote_asset").get("image_path"),
                          background_color: feed.expandedOne("quote_asset").get("background_color"),
                      }
                    : null,

                // Latest fact with complete structure to match DBFactStatement
                latestFact: latestFact
                    ? {
                          id: latestFact.id,
                          network: latestFact.get("network"),
                          policy: latestFact.get("policy"),
                          fact_urn: latestFact.get("fact_urn"),
                          feed: latestFact.get("feed"),
                          value: latestFact.get("value"),
                          value_inverse: latestFact.get("value_inverse"),
                          validation_date: latestFact.get("validation_date"),
                          publication_date: latestFact.get("publication_date"),
                          transaction_id: latestFact.get("transaction_id"),
                          storage_urn: latestFact.get("storage_urn"),
                          block_hash: latestFact.get("block_hash"),
                          output_index: latestFact.get("output_index"),
                          address: latestFact.get("address"),
                          slot: latestFact.get("slot"),
                          statement_hash: latestFact.get("statement_hash"),
                          publication_cost: latestFact.get("publication_cost"),
                          participating_nodes: latestFact.get("participating_nodes") || [],
                          storage_cost: latestFact.get("storage_cost"),
                          sources: latestFact.get("sources") || [],
                          content_signature: latestFact.get("content_signature"),
                          collection_date: latestFact.get("collection_date"),
                          is_archive_indexed: latestFact.get("is_archive_indexed"),
                      }
                    : null,

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

// Custom API endpoint for nodes with metadata
routerAdd("GET", "/api/explorer/nodes/{networkId}", (e) => {
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
                feed = expandedFeed
                    ? {
                          id: expandedFeed.id,
                          feed_id: expandedFeed.get("feed_id"),
                          network: expandedFeed.get("network"),
                          type: expandedFeed.get("type"),
                          name: expandedFeed.get("name"),
                          version: expandedFeed.get("version"),
                          status: expandedFeed.get("status"),
                          inactive_reason: expandedFeed.get("inactive_reason"),
                          source_type: expandedFeed.get("source_type"),
                          funding_type: expandedFeed.get("funding_type"),
                          calculation_method: expandedFeed.get("calculation_method"),
                          heartbeat_interval: expandedFeed.get("heartbeat_interval"),
                          deviation: expandedFeed.get("deviation"),
                          base_asset: expandedFeed.expandedOne("base_asset")
                              ? {
                                    id: expandedFeed.expandedOne("base_asset").id,
                                    ticker: expandedFeed.expandedOne("base_asset").get("ticker"),
                                    name: expandedFeed.expandedOne("base_asset").get("name"),
                                    type: expandedFeed.expandedOne("base_asset").get("type"),
                                    website: expandedFeed.expandedOne("base_asset").get("website"),
                                    fingerprint: expandedFeed
                                        .expandedOne("base_asset")
                                        .get("fingerprint"),
                                    image_path: expandedFeed
                                        .expandedOne("base_asset")
                                        .get("image_path"),
                                    background_color: expandedFeed
                                        .expandedOne("base_asset")
                                        .get("background_color"),
                                }
                              : null,
                          quote_asset: expandedFeed.expandedOne("quote_asset")
                              ? {
                                    id: expandedFeed.expandedOne("quote_asset").id,
                                    ticker: expandedFeed.expandedOne("quote_asset").get("ticker"),
                                    name: expandedFeed.expandedOne("quote_asset").get("name"),
                                    type: expandedFeed.expandedOne("quote_asset").get("type"),
                                    website: expandedFeed.expandedOne("quote_asset").get("website"),
                                    fingerprint: expandedFeed
                                        .expandedOne("quote_asset")
                                        .get("fingerprint"),
                                    image_path: expandedFeed
                                        .expandedOne("quote_asset")
                                        .get("image_path"),
                                    background_color: expandedFeed
                                        .expandedOne("quote_asset")
                                        .get("background_color"),
                                }
                              : null,
                      }
                    : null;
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
                latestFact:
                    latestFact && feed
                        ? {
                              id: latestFact.id,
                              network: latestFact.get("network"),
                              policy: latestFact.get("policy"),
                              fact_urn: latestFact.get("fact_urn"),
                              feed: feed,
                              value: latestFact.get("value"),
                              value_inverse: latestFact.get("value_inverse"),
                              validation_date: latestFact.get("validation_date"),
                              publication_date: latestFact.get("publication_date"),
                              transaction_id: latestFact.get("transaction_id"),
                              storage_urn: latestFact.get("storage_urn"),
                              block_hash: latestFact.get("block_hash"),
                              output_index: latestFact.get("output_index"),
                              address: latestFact.get("address"),
                              slot: latestFact.get("slot"),
                              statement_hash: latestFact.get("statement_hash"),
                              publication_cost: latestFact.get("publication_cost"),
                              participating_nodes: latestFact.get("participating_nodes") || [],
                              storage_cost: latestFact.get("storage_cost"),
                              sources: latestFact.get("sources") || [],
                              content_signature: latestFact.get("content_signature"),
                              collection_date: latestFact.get("collection_date"),
                              is_archive_indexed: latestFact.get("is_archive_indexed"),
                          }
                        : null,
            });
        }

        return e.json(200, nodesWithMetadata);
    } catch (error) {
        console.log("Nodes API error:", error);
        return e.json(500, { error: "Failed to fetch nodes data" });
    }
});

// Custom API endpoint for sources with metadata
routerAdd("GET", "/api/explorer/sources/{networkId}", (e) => {
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
                feed = expandedFeed
                    ? {
                          id: expandedFeed.id,
                          feed_id: expandedFeed.get("feed_id"),
                          network: expandedFeed.get("network"),
                          type: expandedFeed.get("type"),
                          name: expandedFeed.get("name"),
                          version: expandedFeed.get("version"),
                          status: expandedFeed.get("status"),
                          inactive_reason: expandedFeed.get("inactive_reason"),
                          source_type: expandedFeed.get("source_type"),
                          funding_type: expandedFeed.get("funding_type"),
                          calculation_method: expandedFeed.get("calculation_method"),
                          heartbeat_interval: expandedFeed.get("heartbeat_interval"),
                          deviation: expandedFeed.get("deviation"),
                          base_asset: expandedFeed.expandedOne("base_asset")
                              ? {
                                    id: expandedFeed.expandedOne("base_asset").id,
                                    ticker: expandedFeed.expandedOne("base_asset").get("ticker"),
                                    name: expandedFeed.expandedOne("base_asset").get("name"),
                                    type: expandedFeed.expandedOne("base_asset").get("type"),
                                    website: expandedFeed.expandedOne("base_asset").get("website"),
                                    fingerprint: expandedFeed
                                        .expandedOne("base_asset")
                                        .get("fingerprint"),
                                    image_path: expandedFeed
                                        .expandedOne("base_asset")
                                        .get("image_path"),
                                    background_color: expandedFeed
                                        .expandedOne("base_asset")
                                        .get("background_color"),
                                }
                              : null,
                          quote_asset: expandedFeed.expandedOne("quote_asset")
                              ? {
                                    id: expandedFeed.expandedOne("quote_asset").id,
                                    ticker: expandedFeed.expandedOne("quote_asset").get("ticker"),
                                    name: expandedFeed.expandedOne("quote_asset").get("name"),
                                    type: expandedFeed.expandedOne("quote_asset").get("type"),
                                    website: expandedFeed.expandedOne("quote_asset").get("website"),
                                    fingerprint: expandedFeed
                                        .expandedOne("quote_asset")
                                        .get("fingerprint"),
                                    image_path: expandedFeed
                                        .expandedOne("quote_asset")
                                        .get("image_path"),
                                    background_color: expandedFeed
                                        .expandedOne("quote_asset")
                                        .get("background_color"),
                                }
                              : null,
                      }
                    : null;
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
                latestFact:
                    latestFact && feed
                        ? {
                              id: latestFact.id,
                              network: latestFact.get("network"),
                              policy: latestFact.get("policy"),
                              fact_urn: latestFact.get("fact_urn"),
                              feed: feed,
                              value: latestFact.get("value"),
                              value_inverse: latestFact.get("value_inverse"),
                              validation_date: latestFact.get("validation_date"),
                              publication_date: latestFact.get("publication_date"),
                              transaction_id: latestFact.get("transaction_id"),
                              storage_urn: latestFact.get("storage_urn"),
                              block_hash: latestFact.get("block_hash"),
                              output_index: latestFact.get("output_index"),
                              address: latestFact.get("address"),
                              slot: latestFact.get("slot"),
                              statement_hash: latestFact.get("statement_hash"),
                              publication_cost: latestFact.get("publication_cost"),
                              participating_nodes: latestFact.get("participating_nodes") || [],
                              storage_cost: latestFact.get("storage_cost"),
                              sources: latestFact.get("sources") || [],
                              content_signature: latestFact.get("content_signature"),
                              collection_date: latestFact.get("collection_date"),
                              is_archive_indexed: latestFact.get("is_archive_indexed"),
                          }
                        : null,
            });
        }

        return e.json(200, sourcesWithMetadata);
    } catch (error) {
        console.log("Sources API error:", error);
        return e.json(500, { error: "Failed to fetch sources data" });
    }
});
