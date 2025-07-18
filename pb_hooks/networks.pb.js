/// <reference path="../pb_data/types.d.ts" />

// Custom API endpoint for getting all networks
routerAdd("GET", "/api/explorer/networks", (e) => {
    try {
        const networks = $app.findRecordsByFilter("networks", "", "-id", 0, 0, {});

        const networksWithPolicies = [];

        for (let i = 0; i < networks.length; i++) {
            const network = networks[i];

            // Get policies for this network
            const policies = $app.findRecordsByFilter(
                "policies",
                `network = {:networkId}`,
                "-starting_slot",
                0,
                0,
                { networkId: network.id }
            );

            const policiesData = policies.map((policy) => ({
                network: policy.get("network"),
                policy_id: policy.get("policy_id"),
                starting_slot: policy.get("starting_slot"),
                starting_block_hash: policy.get("starting_block_hash"),
                starting_date: policy.get("starting_date"),
            }));

            networksWithPolicies.push({
                id: network.id,
                name: network.get("name"),
                fact_statement_pointer: network.get("fact_statement_pointer"),
                script_token: network.get("script_token"),
                arweave_wallet_address: network.get("arweave_wallet_address"),
                arweave_system_identifier: network.get("arweave_system_identifier"),
                cardano_smart_contract_address: network.get("cardano_smart_contract_address"),
                chain_index_base_url: network.get("chain_index_base_url"),
                active_feeds_url: network.get("active_feeds_url"),
                block_explorer_base_url: network.get("block_explorer_base_url"),
                arweave_explorer_base_url: network.get("arweave_explorer_base_url"),
                last_block_hash: network.get("last_block_hash"),
                last_checkpoint_slot: network.get("last_checkpoint_slot"),
                zero_time: network.get("zero_time"),
                zero_slot: network.get("zero_slot"),
                slot_length: network.get("slot_length"),
                is_enabled: network.get("is_enabled"),
                policies: policiesData,
            });
        }

        return e.json(200, networksWithPolicies);
    } catch (error) {
        console.log("Networks API error:", error);
        return e.json(500, { error: "Failed to fetch networks data" });
    }
});
