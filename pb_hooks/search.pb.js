/// <reference path="../pb_data/types.d.ts" />

// Custom API endpoint for unified search across facts and feeds
routerAdd("GET", "/api/explorer/search/{networkId}", (e) => {
    const { dbUtils } = require(`${__hooks}/utils.pb.js`);
    const { FactModel, FeedWithAssetsModel } = require(`${__hooks}/models.pb.js`);
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

        // OPTIMIZED: Search facts using Query Builder with DynamicModel
        const facts = arrayOf(new DynamicModel(FactModel));

        $app.db()
            .select("*")
            .from("Facts")
            .where(
                $dbx.and(
                    $dbx.exp("network = {:networkId}", { networkId }),
                    $dbx.or(
                        $dbx.exp("fact_urn LIKE {:query}", { query: `%${query}%` }),
                        $dbx.exp("storage_urn LIKE {:query}", { query: `%${query}%` }),
                        $dbx.exp("transaction_id LIKE {:query}", { query: `%${query}%` }),
                        $dbx.exp("block_hash LIKE {:query}", { query: `%${query}%` })
                    )
                )
            )
            .orderBy("validation_date DESC")
            .limit(50)
            .all(facts);

        // Get unique feed IDs from facts
        const factFeedIds = [...new Set(facts.map((f) => f.feed).filter(Boolean))];

        // OPTIMIZED: Get feeds with asset data for facts
        const factFeeds = {};
        if (factFeedIds.length > 0) {
            const feedsData = arrayOf(new DynamicModel(FeedWithAssetsModel));

            $app.db()
                .select(
                    "f.*",
                    "ba.id as ba_id",
                    "ba.ticker as ba_ticker",
                    "ba.name as ba_name",
                    "ba.type as ba_type",
                    "ba.website as ba_website",
                    "ba.fingerprint as ba_fingerprint",
                    "ba.image_path as ba_image_path",
                    "ba.background_color as ba_background_color",
                    "qa.id as qa_id",
                    "qa.ticker as qa_ticker",
                    "qa.name as qa_name",
                    "qa.type as qa_type",
                    "qa.website as qa_website",
                    "qa.fingerprint as qa_fingerprint",
                    "qa.image_path as qa_image_path",
                    "qa.background_color as qa_background_color"
                )
                .from("Feeds f")
                .leftJoin("Assets ba", $dbx.exp("f.base_asset = ba.id"))
                .leftJoin("Assets qa", $dbx.exp("f.quote_asset = qa.id"))
                .where($dbx.in("f.id", ...factFeedIds))
                .all(feedsData);

            // Build lookup map for feeds
            feedsData.forEach((feed) => {
                // Build base asset object - only create if ba_id exists (not null)
                const baseAsset =
                    feed.base_asset && feed.ba_id
                        ? {
                              id: feed.ba_id,
                              ticker: feed.ba_ticker,
                              name: feed.ba_name,
                              type: feed.ba_type,
                              website: feed.ba_website,
                              fingerprint: feed.ba_fingerprint,
                              image_path: feed.ba_image_path,
                              background_color: feed.ba_background_color,
                          }
                        : undefined;

                // Build quote asset object - only create if qa_id exists (not null)
                const quoteAsset =
                    feed.quote_asset && feed.qa_id
                        ? {
                              id: feed.qa_id,
                              ticker: feed.qa_ticker,
                              name: feed.qa_name,
                              type: feed.qa_type,
                              website: feed.qa_website,
                              fingerprint: feed.qa_fingerprint,
                              image_path: feed.qa_image_path,
                              background_color: feed.qa_background_color,
                          }
                        : undefined;

                // Build feed object manually (similar to other endpoints)
                factFeeds[feed.id] = {
                    id: feed.id,
                    feed_id: feed.feed_id,
                    network: feed.network,
                    type: feed.type,
                    name: feed.name,
                    version: feed.version,
                    status: feed.status,
                    inactive_reason: feed.inactive_reason,
                    source_type: feed.source_type,
                    funding_type: feed.funding_type,
                    calculation_method: feed.calculation_method,
                    heartbeat_interval: feed.heartbeat_interval,
                    deviation: feed.deviation,
                    base_asset: baseAsset,
                    quote_asset: quoteAsset,
                };
            });
        }

        // Build facts results
        results.facts = facts.map((fact) => {
            const feed = factFeeds[fact.feed];
            return {
                id: fact.id,
                network: fact.network,
                policy: fact.policy,
                fact_urn: fact.fact_urn,
                feed: feed || null,
                value: fact.value,
                value_inverse: fact.value_inverse,
                validation_date: fact.validation_date,
                publication_date: fact.publication_date,
                transaction_id: fact.transaction_id,
                storage_urn: fact.storage_urn,
                block_hash: fact.block_hash,
                output_index: fact.output_index,
                address: fact.address,
                slot: fact.slot,
                statement_hash: fact.statement_hash,
                publication_cost: fact.publication_cost,
                participating_nodes: fact.participating_nodes || [],
                storage_cost: fact.storage_cost,
                sources: fact.sources || [],
                content_signature: fact.content_signature,
                collection_date: fact.collection_date,
                is_archive_indexed: fact.is_archive_indexed,
            };
        });

        // OPTIMIZED: Search feeds using Query Builder with DynamicModel
        const searchFeeds = arrayOf(new DynamicModel(FeedWithAssetsModel));

        $app.db()
            .select(
                "f.*",
                "ba.id as ba_id",
                "ba.ticker as ba_ticker",
                "ba.name as ba_name",
                "ba.type as ba_type",
                "ba.website as ba_website",
                "ba.fingerprint as ba_fingerprint",
                "ba.image_path as ba_image_path",
                "ba.background_color as ba_background_color",
                "qa.id as qa_id",
                "qa.ticker as qa_ticker",
                "qa.name as qa_name",
                "qa.type as qa_type",
                "qa.website as qa_website",
                "qa.fingerprint as qa_fingerprint",
                "qa.image_path as qa_image_path",
                "qa.background_color as qa_background_color"
            )
            .from("Feeds f")
            .leftJoin("Assets ba", $dbx.exp("f.base_asset = ba.id"))
            .leftJoin("Assets qa", $dbx.exp("f.quote_asset = qa.id"))
            .where(
                $dbx.and(
                    $dbx.exp("f.network = {:networkId}", { networkId }),
                    $dbx.exp("f.feed_id LIKE {:query}", { query: `%${query}%` })
                )
            )
            .orderBy("f.updated DESC")
            .limit(50)
            .all(searchFeeds);

        // Build feeds results
        results.feeds = searchFeeds.map((feed) => {
            // Build base asset object - only create if ba_id exists (not null)
            const baseAsset =
                feed.base_asset && feed.ba_id
                    ? {
                          id: feed.ba_id,
                          ticker: feed.ba_ticker,
                          name: feed.ba_name,
                          type: feed.ba_type,
                          website: feed.ba_website,
                          fingerprint: feed.ba_fingerprint,
                          image_path: feed.ba_image_path,
                          background_color: feed.ba_background_color,
                      }
                    : null;

            // Build quote asset object - only create if qa_id exists (not null)
            const quoteAsset =
                feed.quote_asset && feed.qa_id
                    ? {
                          id: feed.qa_id,
                          ticker: feed.qa_ticker,
                          name: feed.qa_name,
                          type: feed.qa_type,
                          website: feed.qa_website,
                          fingerprint: feed.qa_fingerprint,
                          image_path: feed.qa_image_path,
                          background_color: feed.qa_background_color,
                      }
                    : null;

            return {
                id: feed.id,
                feed_id: feed.feed_id,
                network: feed.network,
                type: feed.type,
                name: feed.name,
                version: feed.version,
                status: feed.status,
                inactive_reason: feed.inactive_reason,
                source_type: feed.source_type,
                funding_type: feed.funding_type,
                calculation_method: feed.calculation_method,
                heartbeat_interval: feed.heartbeat_interval,
                deviation: feed.deviation,
                base_asset: baseAsset,
                quote_asset: quoteAsset,
                type_description: "Current Exchange Rate",
                type_description_short: "CER",
                totalFacts: 0, // Setting to 0 for search results
            };
        });

        return e.json(200, results);
    } catch (error) {
        console.log("Unified search API error:", error);
        return e.json(500, { error: "Failed to perform search" });
    }
});
