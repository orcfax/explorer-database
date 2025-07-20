/// <reference path="../pb_data/types.d.ts" />

// Custom API endpoint for dashboard data
routerAdd("GET", "/api/explorer/dashboard/{networkId}", (e) => {
    const { RssModel, NodeModel, SourceModel } = require(`${__hooks}/models.pb.js`);
    const networkId = e.request.pathValue("networkId");

    try {
        // Compute dashboard stats
        const today = new Date().toISOString().split("T")[0];

        // OPTIMIZED: Get all counts efficiently using Query Builder
        const totalFactsResult = arrayOf(new DynamicModel({ count: 0 }));
        $app.db()
            .select("COUNT(*) as count")
            .from("Facts")
            .where($dbx.exp("network = {:networkId}", { networkId }))
            .all(totalFactsResult);
        const totalFacts = totalFactsResult.length > 0 ? totalFactsResult[0].count : 0;

        const totalFacts24HourResult = arrayOf(new DynamicModel({ count: 0 }));
        $app.db()
            .select("COUNT(*) as count")
            .from("Facts")
            .where(
                $dbx.and(
                    $dbx.exp("network = {:networkId}", { networkId }),
                    $dbx.exp("publication_date >= {:todayStart}", {
                        todayStart: `${today} 00:00:00.000Z`,
                    })
                )
            )
            .all(totalFacts24HourResult);
        const totalFacts24Hour =
            totalFacts24HourResult.length > 0 ? totalFacts24HourResult[0].count : 0;

        const totalActiveFeedsResult = arrayOf(new DynamicModel({ count: 0 }));
        $app.db()
            .select("COUNT(*) as count")
            .from("Feeds")
            .where(
                $dbx.and(
                    $dbx.exp("network = {:networkId}", { networkId }),
                    $dbx.exp("status = 'active'", {})
                )
            )
            .all(totalActiveFeedsResult);
        const totalActiveFeeds =
            totalActiveFeedsResult.length > 0 ? totalActiveFeedsResult[0].count : 0;

        const activeIncidentsResult = arrayOf(new DynamicModel({ count: 0 }));
        $app.db()
            .select("COUNT(*) as count")
            .from("Rss")
            .where(
                $dbx.and(
                    $dbx.exp("type = 'incident_reports'", {}),
                    $dbx.exp("status != 'resolved'", {})
                )
            )
            .all(activeIncidentsResult);
        const activeIncidents =
            activeIncidentsResult.length > 0 ? activeIncidentsResult[0].count : 0;

        // Get latest network update using Query Builder
        function processBlogDescription(description) {
            // Remove leading figure and image tags
            let processed = description.replace(/^<figure>.*?<\/figure>/, "");
            // Remove leading date paragraph
            processed = processed.replace(/^<p><em>.*?<\/em><\/p>/, "");
            // Get only the first paragraph
            const firstParagraph = processed.match(/<p>.*?<\/p>/);
            return firstParagraph ? firstParagraph[0] : processed;
        }

        const rssRecords = arrayOf(new DynamicModel(RssModel));

        $app.db().select("*").from("Rss").orderBy("publish_date DESC").limit(1).all(rssRecords);

        const latestNetworkUpdate =
            rssRecords.length > 0
                ? {
                      id: rssRecords[0].id,
                      title: rssRecords[0].title,
                      type: rssRecords[0].type,
                      description:
                          rssRecords[0].type === "blog_posts"
                              ? processBlogDescription(rssRecords[0].description)
                              : rssRecords[0].description,
                      link: rssRecords[0].link,
                      publish_date: rssRecords[0].publish_date,
                      status: rssRecords[0].status,
                  }
                : null;

        // OPTIMIZED: Get all nodes for the network using Query Builder
        const nodes = arrayOf(new DynamicModel(NodeModel));

        $app.db()
            .select("id", "node_urn", "network", "status", "type", "name")
            .from("Nodes")
            .where($dbx.exp("network = {:networkId}", { networkId }))
            .orderBy("updated DESC")
            .all(nodes);

        const nodesData = nodes.map((node) => ({
            id: node.id,
            node_urn: node.node_urn,
            network: node.network,
            status: node.status,
            type: node.type,
            name: node.name,
        }));

        // OPTIMIZED: Get all active sources for the network using Query Builder
        const sources = arrayOf(new DynamicModel(SourceModel));

        $app.db()
            .select("id", "name", "network", "type")
            .from("Sources")
            .where(
                $dbx.and(
                    $dbx.exp("network = {:networkId}", { networkId }),
                    $dbx.exp("status = 'active'", {})
                )
            )
            .orderBy("updated DESC")
            .all(sources);

        const sourcesData = sources.map((source) => ({
            id: source.id,
            name: source.name,
            network: source.network,
            type: source.type,
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
