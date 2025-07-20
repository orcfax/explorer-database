/// <reference path="../pb_data/types.d.ts" />

// Custom API endpoint for getting all networks
routerAdd("GET", "/api/explorer/networks", (e) => {
    const { NetworkModel, PolicyModel } = require(`${__hooks}/models.pb.js`);

    try {
        // Use Query Builder with DynamicModel for better performance
        const networks = arrayOf(new DynamicModel(NetworkModel));

        // Get all networks using Query Builder
        $app.db().select("*").from("Networks").orderBy("id DESC").all(networks);

        const networkIds = networks.map((n) => n.id);

        if (networkIds.length === 0) {
            return e.json(200, []);
        }

        // Get all policies for all networks in one optimized query
        const policies = arrayOf(new DynamicModel(PolicyModel));

        $app.db()
            .select("network", "policy_id", "starting_slot", "starting_block_hash", "starting_date")
            .from("Policies")
            .where($dbx.in("network", ...networkIds))
            .orderBy("starting_slot DESC")
            .all(policies);

        // Create lookup map for policies by network
        const policiesByNetwork = {};
        policies.forEach((policy) => {
            if (!policiesByNetwork[policy.network]) {
                policiesByNetwork[policy.network] = [];
            }
            policiesByNetwork[policy.network].push({
                network: policy.network,
                policy_id: policy.policy_id,
                starting_slot: policy.starting_slot,
                starting_block_hash: policy.starting_block_hash,
                starting_date: policy.starting_date,
            });
        });

        // Assemble final response
        const networksWithPolicies = networks.map((network) => ({
            id: network.id,
            name: network.name,
            fact_statement_pointer: network.fact_statement_pointer,
            script_token: network.script_token,
            arweave_wallet_address: network.arweave_wallet_address,
            arweave_system_identifier: network.arweave_system_identifier,
            cardano_smart_contract_address: network.cardano_smart_contract_address,
            chain_index_base_url: network.chain_index_base_url,
            active_feeds_url: network.active_feeds_url,
            block_explorer_base_url: network.block_explorer_base_url,
            arweave_explorer_base_url: network.arweave_explorer_base_url,
            last_block_hash: network.last_block_hash,
            last_checkpoint_slot: network.last_checkpoint_slot,
            zero_time: network.zero_time,
            zero_slot: network.zero_slot,
            slot_length: network.slot_length,
            is_enabled: network.is_enabled,
            policies: policiesByNetwork[network.id] || [],
        }));

        return e.json(200, networksWithPolicies);
    } catch (error) {
        console.log("Networks API error:", error);
        return e.json(500, { error: "Failed to fetch networks data" });
    }
});
