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
