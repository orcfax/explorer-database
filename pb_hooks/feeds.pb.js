/// <reference path="../pb_data/types.d.ts" />

// Custom API endpoint for feeds with optimized data loading
routerAdd("GET", "/api/explorer/feeds/{networkId}", (e) => {
    const { dateUtils } = require(`${__hooks}/utils.pb.js`);
    const { FeedWithAssetsModel, FactModel } = require(`${__hooks}/models.pb.js`);
    const networkId = e.request.pathValue("networkId");

    try {
        const feeds = arrayOf(new DynamicModel(FeedWithAssetsModel));

        // Get feeds with all related asset data using Query Builder
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
            .where($dbx.exp("f.network = {:networkId}", { networkId }))
            .orderBy("f.updated DESC")
            .all(feeds);

        const feedIds = feeds.map((f) => f.id);

        if (feedIds.length === 0) {
            return e.json(200, []);
        }

        // OPTIMIZED: Get latest facts using a subquery to avoid loading all facts
        const latestFacts = arrayOf(new DynamicModel(FactModel));

        // Use a subquery to get only the latest fact per feed efficiently
        const latestFactsSQL = `
            SELECT f.*
            FROM Facts f
            INNER JOIN (
                SELECT feed, MAX(validation_date) as max_date
                FROM Facts 
                WHERE network = {:networkId} AND feed IN (${feedIds.map((_, i) => `{:feedId${i}}`).join(",")})
                GROUP BY feed
            ) latest ON f.feed = latest.feed AND f.validation_date = latest.max_date
            WHERE f.network = {:networkId}
        `;

        const latestFactsParams = { networkId };
        feedIds.forEach((feedId, i) => {
            latestFactsParams[`feedId${i}`] = feedId;
        });

        $app.db().newQuery(latestFactsSQL).bind(latestFactsParams).all(latestFacts);

        // OPTIMIZED: Get fact counts efficiently
        const factCounts = arrayOf(
            new DynamicModel({
                feed: "",
                count: 0,
            })
        );

        $app.db()
            .select("feed", "COUNT(*) as count")
            .from("Facts")
            .where(
                $dbx.and(
                    $dbx.exp("network = {:networkId}", { networkId }),
                    $dbx.in("feed", ...feedIds)
                )
            )
            .groupBy("feed")
            .all(factCounts);

        // OPTIMIZED: Get historical values efficiently

        const oneDayAgoFilter = dateUtils.getFormattedDateFilter(1);
        const threeDaysAgoFilter = dateUtils.getFormattedDateFilter(3);
        const sevenDaysAgoFilter = dateUtils.getFormattedDateFilter(7);

        // Optimized historical queries - run for better performance with SQLite-compatible subqueries
        const historicalQueries = [
            { filter: oneDayAgoFilter, key: "oneDayAgo" },
            { filter: threeDaysAgoFilter, key: "threeDaysAgo" },
            { filter: sevenDaysAgoFilter, key: "sevenDaysAgo" },
        ];

        const historicalResults = {};

        // Process historical queries more efficiently using subqueries
        for (const { filter, key } of historicalQueries) {
            const results = arrayOf(
                new DynamicModel({
                    feed: "",
                    value: -0,
                })
            );

            // Use subquery to get only the latest value per feed for each time period
            const historicalSubQuery = `
                SELECT f1.feed, f1.value
                FROM Facts f1
                INNER JOIN (
                    SELECT feed, MAX(validation_date) as max_date
                    FROM Facts 
                    WHERE network = {:networkId} 
                        AND feed IN (${feedIds.map((_, i) => `{:feedId${i}}`).join(",")})
                        AND validation_date <= {:date}
                    GROUP BY feed
                ) f2 ON f1.feed = f2.feed AND f1.validation_date = f2.max_date
                WHERE f1.network = {:networkId}
                    AND f1.validation_date <= {:date}
            `;

            const params = { networkId, date: filter };
            feedIds.forEach((feedId, i) => {
                params[`feedId${i}`] = feedId;
            });

            $app.db().newQuery(historicalSubQuery).bind(params).all(results);

            // Convert to lookup map
            const feedValues = {};
            results.forEach((result) => {
                feedValues[result.feed] = result.value;
            });

            historicalResults[key] = feedValues;
        }

        // Create lookup maps for efficient data assembly
        const latestFactsMap = {};
        latestFacts.forEach((fact) => {
            latestFactsMap[fact.feed] = fact;
        });

        const factCountsMap = factCounts.reduce((acc, count) => {
            acc[count.feed] = count.count;
            return acc;
        }, {});

        // Historical results are already in the correct format

        // Assemble final response efficiently
        const feedsWithData = feeds.map((feed) => {
            // Build base asset object
            const baseAsset = feed.base_asset
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

            // Build quote asset object
            const quoteAsset = feed.quote_asset
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

            // Get data from lookup maps
            const latestFactRecord = latestFactsMap[feed.id] || null;
            const totalFacts = factCountsMap[feed.id] || 0;
            const oneDayAgo = historicalResults.oneDayAgo[feed.id] || null;
            const threeDaysAgo = historicalResults.threeDaysAgo[feed.id] || null;
            const sevenDaysAgo = historicalResults.sevenDaysAgo[feed.id] || null;

            // Build latest fact object from DynamicModel
            const latestFact = latestFactRecord
                ? {
                      id: latestFactRecord.id,
                      network: latestFactRecord.network,
                      policy: latestFactRecord.policy,
                      fact_urn: latestFactRecord.fact_urn,
                      feed: latestFactRecord.feed,
                      value: latestFactRecord.value,
                      value_inverse: latestFactRecord.value_inverse,
                      validation_date: latestFactRecord.validation_date,
                      publication_date: latestFactRecord.publication_date,
                      transaction_id: latestFactRecord.transaction_id,
                      storage_urn: latestFactRecord.storage_urn,
                      block_hash: latestFactRecord.block_hash,
                      output_index: latestFactRecord.output_index,
                      address: latestFactRecord.address,
                      slot: latestFactRecord.slot,
                      statement_hash: latestFactRecord.statement_hash,
                      publication_cost: latestFactRecord.publication_cost,
                      participating_nodes: latestFactRecord.participating_nodes || [],
                      storage_cost: latestFactRecord.storage_cost,
                      sources: latestFactRecord.sources || [],
                      content_signature: latestFactRecord.content_signature,
                      collection_date: latestFactRecord.collection_date,
                      is_archive_indexed: latestFactRecord.is_archive_indexed,
                  }
                : null;

            return {
                // Base feed properties
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

                // Asset properties
                base_asset: baseAsset,
                quote_asset: quoteAsset,

                // Latest fact with complete structure
                latestFact: latestFact,

                // Metadata
                totalFacts,
                type_description: "Current Exchange Rate",
                type_description_short: "CER",

                // Historical values
                oneDayAgo,
                threeDaysAgo,
                sevenDaysAgo,
            };
        });

        return e.json(200, feedsWithData);
    } catch (error) {
        console.log("Feeds API error:", error);
        return e.json(500, { error: "Failed to fetch feeds data" });
    }
});

// Custom API endpoint for getting a specific feed by ID
routerAdd("GET", "/api/explorer/feeds/{networkId}/{feedId}", (e) => {
    const { dateUtils } = require(`${__hooks}/utils.pb.js`);
    const networkId = e.request.pathValue("networkId");
    const feedId = decodeURIComponent(e.request.pathValue("feedId"));

    try {
        // Clean up feedId - remove any trailing "/facts/undefined"
        const cleanFeedId = feedId.replace(/\/facts\/undefined$/, "");

        const feeds = arrayOf(
            new DynamicModel({
                // Feed table fields
                id: "",
                feed_id: "",
                network: "",
                type: "",
                name: "",
                version: 0,
                status: "",
                inactive_reason: "",
                source_type: "",
                funding_type: "",
                calculation_method: "",
                heartbeat_interval: 0,
                deviation: 0,
                base_asset: "",
                quote_asset: "",

                // Base asset fields (ba_ prefixed)
                ba_id: "",
                ba_ticker: "",
                ba_name: "",
                ba_type: "",
                ba_website: "",
                ba_fingerprint: "",
                ba_image_path: "",
                ba_background_color: "",

                // Quote asset fields (qa_ prefixed)
                qa_id: "",
                qa_ticker: "",
                qa_name: "",
                qa_type: "",
                qa_website: "",
                qa_fingerprint: "",
                qa_image_path: "",
                qa_background_color: "",
            })
        );

        // Get feed with all related asset data using Query Builder
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
                    $dbx.exp("f.feed_id LIKE {:feedIdPattern}", {
                        feedIdPattern: cleanFeedId + "/%",
                    })
                )
            )
            .orderBy("f.updated DESC")
            .limit(1)
            .all(feeds);

        if (feeds.length === 0) {
            return e.json(404, { error: "Feed not found" });
        }

        const feed = feeds[0];

        // OPTIMIZED: Get latest fact using subquery
        const latestFacts = arrayOf(
            new DynamicModel({
                feed: "",
                id: "",
                network: "",
                policy: "",
                fact_urn: "",
                value: -0,
                value_inverse: -0,
                validation_date: "",
                publication_date: "",
                transaction_id: "",
                storage_urn: "",
                block_hash: "",
                output_index: 0,
                address: "",
                slot: 0,
                statement_hash: "",
                publication_cost: -0,
                participating_nodes: [],
                storage_cost: -0,
                sources: [],
                content_signature: "",
                collection_date: "",
                is_archive_indexed: false,
            })
        );

        const latestFactSQL = `
            SELECT f.*
            FROM Facts f
            WHERE f.network = {:networkId} 
                AND f.feed = {:feedId}
            ORDER BY f.validation_date DESC
            LIMIT 1
        `;

        $app.db()
            .newQuery(latestFactSQL)
            .bind({
                networkId: networkId,
                feedId: feed.id,
            })
            .all(latestFacts);

        // OPTIMIZED: Get fact count efficiently
        const factCounts = arrayOf(
            new DynamicModel({
                count: 0,
            })
        );

        $app.db()
            .select("COUNT(*) as count")
            .from("Facts")
            .where(
                $dbx.and(
                    $dbx.exp("network = {:networkId}", { networkId }),
                    $dbx.exp("feed = {:feedId}", { feedId: feed.id })
                )
            )
            .all(factCounts);

        const totalFacts = factCounts.length > 0 ? factCounts[0].count : 0;

        // OPTIMIZED: Get historical values efficiently
        const oneDayAgoFilter = dateUtils.getFormattedDateFilter(1);
        const threeDaysAgoFilter = dateUtils.getFormattedDateFilter(3);
        const sevenDaysAgoFilter = dateUtils.getFormattedDateFilter(7);

        const historicalQueries = [
            { filter: oneDayAgoFilter, key: "oneDayAgo" },
            { filter: threeDaysAgoFilter, key: "threeDaysAgo" },
            { filter: sevenDaysAgoFilter, key: "sevenDaysAgo" },
        ];

        const historicalValues = {};

        // Process historical queries efficiently using subqueries
        for (const { filter, key } of historicalQueries) {
            const results = arrayOf(
                new DynamicModel({
                    value: -0,
                })
            );

            const historicalSubQuery = `
                SELECT f1.value
                FROM Facts f1
                WHERE f1.network = {:networkId} 
                    AND f1.feed = {:feedId}
                    AND f1.validation_date <= {:date}
                ORDER BY f1.validation_date DESC
                LIMIT 1
            `;

            $app.db()
                .newQuery(historicalSubQuery)
                .bind({
                    networkId: networkId,
                    feedId: feed.id,
                    date: filter,
                })
                .all(results);

            historicalValues[key] = results.length > 0 ? results[0].value : null;
        }

        // Build base asset object
        const baseAsset = feed.base_asset
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

        // Build quote asset object
        const quoteAsset = feed.quote_asset
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

        // Build latest fact object
        const latestFactRecord = latestFacts.length > 0 ? latestFacts[0] : null;
        const latestFact = latestFactRecord
            ? {
                  id: latestFactRecord.id,
                  network: latestFactRecord.network,
                  policy: latestFactRecord.policy,
                  fact_urn: latestFactRecord.fact_urn,
                  feed: latestFactRecord.feed,
                  value: latestFactRecord.value,
                  value_inverse: latestFactRecord.value_inverse,
                  validation_date: latestFactRecord.validation_date,
                  publication_date: latestFactRecord.publication_date,
                  transaction_id: latestFactRecord.transaction_id,
                  storage_urn: latestFactRecord.storage_urn,
                  block_hash: latestFactRecord.block_hash,
                  output_index: latestFactRecord.output_index,
                  address: latestFactRecord.address,
                  slot: latestFactRecord.slot,
                  statement_hash: latestFactRecord.statement_hash,
                  publication_cost: latestFactRecord.publication_cost,
                  participating_nodes: latestFactRecord.participating_nodes || [],
                  storage_cost: latestFactRecord.storage_cost,
                  sources: latestFactRecord.sources || [],
                  content_signature: latestFactRecord.content_signature,
                  collection_date: latestFactRecord.collection_date,
                  is_archive_indexed: latestFactRecord.is_archive_indexed,
              }
            : null;

        const feedWithData = {
            // Base feed properties
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

            // Asset properties
            base_asset: baseAsset,
            quote_asset: quoteAsset,

            // Latest fact with complete structure
            latestFact: latestFact,

            // Metadata
            totalFacts,
            type_description: "Current Exchange Rate",
            type_description_short: "CER",

            // Historical values
            oneDayAgo: historicalValues.oneDayAgo,
            threeDaysAgo: historicalValues.threeDaysAgo,
            sevenDaysAgo: historicalValues.sevenDaysAgo,
        };

        return e.json(200, feedWithData);
    } catch (error) {
        console.log("Feed by ID API error:", error);
        return e.json(500, { error: "Failed to fetch feed data" });
    }
});

// Custom API endpoint for getting feed facts by date range
routerAdd("GET", "/api/explorer/feeds/{networkId}/{feedId}/facts", (e) => {
    const { dateUtils } = require(`${__hooks}/utils.pb.js`);
    const networkId = e.request.pathValue("networkId");
    const feedId = decodeURIComponent(e.request.pathValue("feedId"));
    const rangeOfDays = parseInt(e.request.url.query().get("range") || "1");
    const startDate = decodeURIComponent(e.request.url.query().get("startDate"));

    try {
        // Clean up feedId - remove any trailing "/facts/undefined"
        const cleanFeedId = feedId.replace(/\/facts\/undefined$/, "");

        // OPTIMIZED: Get feed record using query builder
        const feedRecords = arrayOf(
            new DynamicModel({
                id: "",
                feed_id: "",
                network: "",
            })
        );

        $app.db()
            .select("id", "feed_id", "network")
            .from("Feeds")
            .where(
                $dbx.and(
                    $dbx.exp("network = {:networkId}", { networkId }),
                    $dbx.exp("feed_id LIKE {:feedIdPattern}", {
                        feedIdPattern: cleanFeedId + "/%",
                    })
                )
            )
            .orderBy("updated DESC")
            .limit(1)
            .all(feedRecords);

        if (feedRecords.length === 0) {
            return e.json(404, { error: "Feed not found" });
        }

        const feedRecord = feedRecords[0];

        // Calculate date range with proper date handling
        const start = startDate ? new Date(startDate) : new Date();
        const endDate = dateUtils.subtractDays(start, rangeOfDays - 1);
        const endDateFilter = dateUtils.formatDate(endDate, "yyyy-MM-dd") + " 00:00:00.000Z";

        // OPTIMIZED: Get facts using query builder with DynamicModel
        const facts = arrayOf(
            new DynamicModel({
                id: "",
                network: "",
                policy: "",
                fact_urn: "",
                feed: "",
                value: -0,
                value_inverse: -0,
                validation_date: "",
                publication_date: "",
                transaction_id: "",
                storage_urn: "",
                block_hash: "",
                output_index: 0,
                address: "",
                slot: 0,
                statement_hash: "",
                publication_cost: -0,
                participating_nodes: [],
                storage_cost: -0,
                sources: [],
                content_signature: "",
                collection_date: "",
                is_archive_indexed: false,
            })
        );

        $app.db()
            .select("*")
            .from("Facts")
            .where(
                $dbx.and(
                    $dbx.exp("network = {:networkId}", { networkId }),
                    $dbx.exp("feed = {:feedId}", { feedId: feedRecord.id }),
                    $dbx.exp("validation_date > {:endDate}", { endDate: endDateFilter })
                )
            )
            .orderBy("validation_date DESC")
            .limit(5000)
            .all(facts);

        // Build response with complete fact objects
        const factsData = facts.map((fact) => ({
            id: fact.id,
            network: fact.network,
            policy: fact.policy,
            fact_urn: fact.fact_urn,
            feed: fact.feed,
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
        }));

        return e.json(200, factsData);
    } catch (error) {
        console.log("Feed facts by date range API error:", error);
        return e.json(500, { error: "Failed to fetch feed facts by date range" });
    }
});
