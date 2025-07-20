/// <reference path="../pb_data/types.d.ts" />

/**
 * Reusable DynamicModel structures for PocketBase queries
 *
 * This module exports pre-configured model objects that can be used with arrayOf(new DynamicModel(...))
 * to avoid repetitive model definitions across the codebase.
 */

// Core entity models
const FactModel = {
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
};

const FactWithJoinedFeedModel = {
    // Facts table fields (from f.*)
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

    // Feeds table fields (aliased)
    feed_internal_id: "",
    feed_network: "",
    feed_identifier: "",
    feed_type: "",
    feed_name: "",
    version: 0,
    feed_status: "",
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
    ba_hasXerberusRiskRating: false,

    // Quote asset fields (qa_ prefixed)
    qa_id: "",
    qa_ticker: "",
    qa_name: "",
    qa_type: "",
    qa_website: "",
    qa_fingerprint: "",
    qa_image_path: "",
    qa_background_color: "",
    qa_hasXerberusRiskRating: false,
};

const FeedWithAssetsModel = {
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
};

const NodeModel = {
    id: "",
    node_urn: "",
    network: "",
    status: "",
    type: "",
    name: "",
    address_locality: "",
    address_region: "",
    geo_coordinates: "",
};

const SourceModel = {
    id: "",
    name: "",
    network: "",
    recipient: "",
    sender: "",
    type: "",
    website: "",
    image_path: "",
    background_color: "",
};

const NetworkModel = {
    id: "",
    name: "",
    fact_statement_pointer: "",
    script_token: "",
    arweave_wallet_address: "",
    arweave_system_identifier: "",
    cardano_smart_contract_address: "",
    chain_index_base_url: "",
    active_feeds_url: "",
    block_explorer_base_url: "",
    arweave_explorer_base_url: "",
    last_block_hash: "",
    last_checkpoint_slot: 0,
    zero_time: 0,
    zero_slot: 0,
    slot_length: 0,
    is_enabled: false,
};

const PolicyModel = {
    network: "",
    policy_id: "",
    starting_slot: 0,
    starting_block_hash: "",
    starting_date: "",
};

const RssModel = {
    id: "",
    title: "",
    type: "",
    description: "",
    link: "",
    publish_date: "",
    status: "",
};

// Export utilities for use in other files
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        FactModel,
        FactWithJoinedFeedModel,
        FeedWithAssetsModel,
        NodeModel,
        SourceModel,
        NetworkModel,
        PolicyModel,
        RssModel,
    };
}
