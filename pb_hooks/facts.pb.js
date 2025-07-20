/// <reference path="../pb_data/types.d.ts" />

// Custom API endpoint for getting paginated facts
routerAdd("GET", "/api/explorer/facts/{networkId}", (e) => {
    const { FactWithJoinedFeedModel, NodeModel } = require(`${__hooks}/models.pb.js`);
    const networkId = e.request.pathValue("networkId");
    const page = parseInt(e.request.url.query().get("page") || "1");
    const feedId = e.request.url.query().get("feedId") || null;
    const limit = 5;
    const offset = (page - 1) * limit;

    try {
        const facts = arrayOf(new DynamicModel(FactWithJoinedFeedModel));

        // Get facts with all related data - using Query Builder
        let factsQuery = $app
            .db()
            .select(
                "f.*",
                "fd.id as feed_internal_id",
                "fd.network as feed_network",
                "fd.feed_id as feed_identifier",
                "fd.type as feed_type",
                "fd.name as feed_name",
                "fd.version",
                "fd.status as feed_status",
                "fd.inactive_reason",
                "fd.source_type",
                "fd.funding_type",
                "fd.calculation_method",
                "fd.heartbeat_interval",
                "fd.deviation",
                "fd.base_asset",
                "fd.quote_asset",
                "ba.id as ba_id",
                "ba.ticker as ba_ticker",
                "ba.name as ba_name",
                "ba.type as ba_type",
                "ba.website as ba_website",
                "ba.fingerprint as ba_fingerprint",
                "ba.image_path as ba_image_path",
                "ba.background_color as ba_background_color",
                "ba.hasXerberusRiskRating as ba_hasXerberusRiskRating",
                "qa.id as qa_id",
                "qa.ticker as qa_ticker",
                "qa.name as qa_name",
                "qa.type as qa_type",
                "qa.website as qa_website",
                "qa.fingerprint as qa_fingerprint",
                "qa.image_path as qa_image_path",
                "qa.background_color as qa_background_color",
                "qa.hasXerberusRiskRating as qa_hasXerberusRiskRating"
            )
            .from("Facts f")
            .innerJoin("Feeds fd", $dbx.exp("f.feed = fd.id"))
            .leftJoin("Assets ba", $dbx.exp("fd.base_asset = ba.id"))
            .leftJoin("Assets qa", $dbx.exp("fd.quote_asset = qa.id"))
            .where($dbx.exp("f.network = {:networkId}", { networkId }))
            .orderBy("f.validation_date DESC")
            .limit(limit)
            .offset(offset);

        // Handle optional feedId filter
        if (feedId) {
            factsQuery = factsQuery.andWhere($dbx.exp("fd.feed_id = {:feedId}", { feedId }));
        }

        factsQuery.all(facts);

        const counts = arrayOf(
            new DynamicModel({
                totalCount: 0,
                totalPages: 0,
            })
        );

        // Count query - using Query Builder
        let countQuery = $app
            .db()
            .select("COUNT(*) AS totalCount")
            .from("Facts f")
            .innerJoin("Feeds fd", $dbx.exp("f.feed = fd.id"))
            .where($dbx.exp("f.network = {:networkId}", { networkId }));

        // Handle optional feedId filter for count query
        if (feedId) {
            countQuery = countQuery.andWhere($dbx.exp("fd.feed_id = {:feedId}", { feedId }));
        }

        countQuery.all(counts);

        // Calculate totalPages
        const totalCount = counts[0].totalCount;
        const totalPages = Math.ceil(totalCount / limit);

        // Get all unique participating node IDs and fetch nodes
        const allNodeIds = facts.flatMap((fact) => fact.participating_nodes || []);
        const uniqueNodeIds = [...new Set(allNodeIds)];

        let nodesMap = {};
        if (uniqueNodeIds.length > 0) {
            const nodes = arrayOf(new DynamicModel(NodeModel));

            $app.db()
                .select("*")
                .from("nodes")
                .where($dbx.in("id", ...uniqueNodeIds))
                .all(nodes);

            nodes.forEach((node) => {
                nodesMap[node.id] = {
                    id: node.id,
                    node_urn: node.node_urn,
                    network: node.network,
                    status: node.status,
                    type: node.type,
                    name: node.name,
                    address_locality: node.address_locality,
                    address_region: node.address_region,
                    geo_coordinates: node.geo_coordinates,
                };
            });
        }

        // Build response data
        const factsWithFullData = facts.map((fact) => {
            // Build base asset object (uses ba_ prefixed fields)
            const baseAsset = fact.base_asset
                ? {
                      id: fact.ba_id,
                      ticker: fact.ba_ticker,
                      name: fact.ba_name,
                      type: fact.ba_type,
                      website: fact.ba_website,
                      fingerprint: fact.ba_fingerprint,
                      image_path: fact.ba_image_path,
                      background_color: fact.ba_background_color,
                      hasXerberusRiskRating: fact.ba_hasXerberusRiskRating,
                  }
                : undefined;

            // Build quote asset object (uses qa_ prefixed fields)
            const quoteAsset = fact.quote_asset
                ? {
                      id: fact.qa_id,
                      ticker: fact.qa_ticker,
                      name: fact.qa_name,
                      type: fact.qa_type,
                      website: fact.qa_website,
                      fingerprint: fact.qa_fingerprint,
                      image_path: fact.qa_image_path,
                      background_color: fact.qa_background_color,
                      hasXerberusRiskRating: fact.qa_hasXerberusRiskRating,
                  }
                : undefined;

            // Build feed object
            const feed = {
                id: fact.feed_internal_id,
                network: fact.feed_network,
                feed_id: fact.feed_identifier,
                type: fact.feed_type,
                name: fact.feed_name,
                version: fact.version,
                status: fact.feed_status,
                inactive_reason: fact.inactive_reason,
                source_type: fact.source_type,
                funding_type: fact.funding_type,
                calculation_method: fact.calculation_method,
                heartbeat_interval: fact.heartbeat_interval,
                deviation: fact.deviation,
                base_asset: baseAsset,
                quote_asset: quoteAsset,
            };

            // Build participating nodes
            const participatingNodes = (fact.participating_nodes || [])
                .map((nodeId) => nodesMap[nodeId])
                .filter(Boolean);

            return {
                id: fact.id,
                network: fact.network,
                policy: fact.policy,
                fact_urn: fact.fact_urn,
                feed: feed,
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
                participating_nodes: participatingNodes,
                storage_cost: fact.storage_cost,
                sources: fact.sources || [],
                content_signature: fact.content_signature,
                collection_date: fact.collection_date,
                is_archive_indexed: fact.is_archive_indexed,
            };
        });

        return e.json(200, {
            facts: factsWithFullData,
            totalPages: totalPages,
            totalFacts: totalCount,
        });
    } catch (error) {
        console.log("Facts API error:", error);
        return e.json(500, { error: "Failed to fetch facts data" });
    }
});

// Custom API endpoint for getting a specific fact by URN
routerAdd("GET", "/api/explorer/facts/{networkId}/{factUrn}", (e) => {
    const { FactWithJoinedFeedModel, NodeModel } = require(`${__hooks}/models.pb.js`);
    const networkId = e.request.pathValue("networkId");
    const factUrn = e.request.pathValue("factUrn");
    const feedId = e.request.url.query().get("feedId");

    try {
        const facts = arrayOf(new DynamicModel(FactWithJoinedFeedModel));

        // Get fact with all related data - using Query Builder
        let factQuery = $app
            .db()
            .select(
                "f.*",
                "fd.id as feed_internal_id",
                "fd.network as feed_network",
                "fd.feed_id as feed_identifier",
                "fd.type as feed_type",
                "fd.name as feed_name",
                "fd.version",
                "fd.status as feed_status",
                "fd.inactive_reason",
                "fd.source_type",
                "fd.funding_type",
                "fd.calculation_method",
                "fd.heartbeat_interval",
                "fd.deviation",
                "fd.base_asset",
                "fd.quote_asset",
                "ba.id as ba_id",
                "ba.ticker as ba_ticker",
                "ba.name as ba_name",
                "ba.type as ba_type",
                "ba.website as ba_website",
                "ba.fingerprint as ba_fingerprint",
                "ba.image_path as ba_image_path",
                "ba.background_color as ba_background_color",
                "ba.hasXerberusRiskRating as ba_hasXerberusRiskRating",
                "qa.id as qa_id",
                "qa.ticker as qa_ticker",
                "qa.name as qa_name",
                "qa.type as qa_type",
                "qa.website as qa_website",
                "qa.fingerprint as qa_fingerprint",
                "qa.image_path as qa_image_path",
                "qa.background_color as qa_background_color",
                "qa.hasXerberusRiskRating as qa_hasXerberusRiskRating"
            )
            .from("Facts f")
            .innerJoin("Feeds fd", $dbx.exp("f.feed = fd.id"))
            .leftJoin("Assets ba", $dbx.exp("fd.base_asset = ba.id"))
            .leftJoin("Assets qa", $dbx.exp("fd.quote_asset = qa.id"))
            .where(
                $dbx.exp("f.network = {:networkId} AND f.fact_urn = {:factUrn}", {
                    networkId,
                    factUrn,
                })
            )
            .limit(1);

        // Handle optional feedId filter
        if (feedId) {
            factQuery = factQuery.andWhere($dbx.exp("fd.feed_id = {:feedId}", { feedId }));
        }

        factQuery.all(facts);

        if (facts.length === 0) {
            return e.json(404, { error: "Fact not found" });
        }

        const fact = facts[0];

        // Get participating nodes data
        let nodesMap = {};
        const participatingNodeIds = fact.participating_nodes || [];
        if (participatingNodeIds.length > 0) {
            const nodes = arrayOf(new DynamicModel(NodeModel));

            $app.db()
                .select("*")
                .from("nodes")
                .where($dbx.in("id", ...participatingNodeIds))
                .all(nodes);

            nodes.forEach((node) => {
                nodesMap[node.id] = {
                    id: node.id,
                    node_urn: node.node_urn,
                    network: node.network,
                    status: node.status,
                    type: node.type,
                    name: node.name,
                    address_locality: node.address_locality,
                    address_region: node.address_region,
                    geo_coordinates: node.geo_coordinates,
                };
            });
        }

        // Build base asset object (uses ba_ prefixed fields)
        const baseAsset = fact.base_asset
            ? {
                  id: fact.ba_id,
                  ticker: fact.ba_ticker,
                  name: fact.ba_name,
                  type: fact.ba_type,
                  website: fact.ba_website,
                  fingerprint: fact.ba_fingerprint,
                  image_path: fact.ba_image_path,
                  background_color: fact.ba_background_color,
                  hasXerberusRiskRating: fact.ba_hasXerberusRiskRating,
              }
            : undefined;

        // Build quote asset object (uses qa_ prefixed fields)
        const quoteAsset = fact.quote_asset
            ? {
                  id: fact.qa_id,
                  ticker: fact.qa_ticker,
                  name: fact.qa_name,
                  type: fact.qa_type,
                  website: fact.qa_website,
                  fingerprint: fact.qa_fingerprint,
                  image_path: fact.qa_image_path,
                  background_color: fact.qa_background_color,
                  hasXerberusRiskRating: fact.qa_hasXerberusRiskRating,
              }
            : undefined;

        // Build feed object
        const feed = {
            id: fact.feed_internal_id,
            network: fact.feed_network,
            feed_id: fact.feed_identifier,
            type: fact.feed_type,
            name: fact.feed_name,
            version: fact.version,
            status: fact.feed_status,
            inactive_reason: fact.inactive_reason,
            source_type: fact.source_type,
            funding_type: fact.funding_type,
            calculation_method: fact.calculation_method,
            heartbeat_interval: fact.heartbeat_interval,
            deviation: fact.deviation,
            base_asset: baseAsset,
            quote_asset: quoteAsset,
        };

        // Build participating nodes
        const participatingNodes = (fact.participating_nodes || [])
            .map((nodeId) => nodesMap[nodeId])
            .filter(Boolean);

        const factWithFeed = {
            id: fact.id,
            network: fact.network,
            policy: fact.policy,
            fact_urn: fact.fact_urn,
            feed: feed,
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
            participating_nodes: participatingNodes,
            storage_cost: fact.storage_cost,
            sources: fact.sources || [],
            content_signature: fact.content_signature,
            collection_date: fact.collection_date,
            is_archive_indexed: fact.is_archive_indexed,
        };

        return e.json(200, factWithFeed);
    } catch (error) {
        console.log("Fact by URN API error:", error);
        return e.json(500, { error: "Failed to fetch fact by URN" });
    }
});
