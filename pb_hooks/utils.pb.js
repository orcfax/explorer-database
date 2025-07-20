/// <reference path="../pb_data/types.d.ts" />

// Date formatting utilities to replace date-fns functionality
const dateUtils = {
    // Format a date to YYYY-MM-DD format
    formatDate: (date, formatString) => {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, "0");
        const day = String(date.getUTCDate()).padStart(2, "0");

        if (formatString === "yyyy-MM-dd") {
            return `${year}-${month}-${day}`;
        }

        // Default ISO format
        return date.toISOString();
    },

    // Subtract days from a date
    subtractDays: (date, days) => {
        const result = new Date(date);
        result.setUTCDate(result.getUTCDate() - days);
        return result;
    },

    // Convert to zoned time (UTC in this case)
    toZonedTime: (date, timezone) => {
        // Since we're always using UTC, just return the date
        return new Date(date);
    },

    // Format zoned time
    formatZonedTime: (date, formatString, options) => {
        return dateUtils.formatDate(date, formatString);
    },

    // Get formatted date filter for historical values
    getFormattedDateFilter: (daysAgo) => {
        const now = new Date();
        const isoString = now.toISOString();
        const timeString = isoString.split("T")[1].slice(0, 12) + "Z";

        const newDate = dateUtils.subtractDays(now, daysAgo);
        const formattedDate = dateUtils.formatDate(newDate, "yyyy-MM-dd");

        return `${formattedDate} ${timeString}`;
    },
};

// Common database helper functions
const dbUtils = {
    // Expand a record with related fields
    expandRecord: (record, fields) => {
        try {
            $app.expandRecord(record, fields, null);
            return true;
        } catch (error) {
            console.log("Error expanding record:", error);
            return false;
        }
    },

    // Build asset object from expanded record
    buildAssetObject: (expandedAsset) => {
        if (!expandedAsset) return undefined; // Return undefined instead of null for optional Zod fields

        return {
            id: expandedAsset.id,
            ticker: expandedAsset.get("ticker"),
            name: expandedAsset.get("name"),
            type: expandedAsset.get("type"),
            website: expandedAsset.get("website"),
            fingerprint: expandedAsset.get("fingerprint"),
            image_path: expandedAsset.get("image_path"),
            background_color: expandedAsset.get("background_color"),
        };
    },

    // Build feed object from expanded record
    buildFeedObject: (expandedFeed) => {
        if (!expandedFeed) return null;

        const baseAsset = dbUtils.buildAssetObject(expandedFeed.expandedOne("base_asset"));
        const quoteAsset = dbUtils.buildAssetObject(expandedFeed.expandedOne("quote_asset"));

        const feedObject = {
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
        };

        // Only add asset fields if they exist (for optional Zod fields)
        if (baseAsset) {
            feedObject.base_asset = baseAsset;
        }
        if (quoteAsset) {
            feedObject.quote_asset = quoteAsset;
        }

        return feedObject;
    },

    // Build fact object from record
    buildFactObject: (factRecord, expandedFeed) => {
        if (!factRecord) return null;

        return {
            id: factRecord.id,
            network: factRecord.get("network"),
            policy: factRecord.get("policy"),
            fact_urn: factRecord.get("fact_urn"),
            feed: expandedFeed || factRecord.get("feed"),
            value: factRecord.get("value"),
            value_inverse: factRecord.get("value_inverse"),
            validation_date: factRecord.get("validation_date"),
            publication_date: factRecord.get("publication_date"),
            transaction_id: factRecord.get("transaction_id"),
            storage_urn: factRecord.get("storage_urn"),
            block_hash: factRecord.get("block_hash"),
            output_index: factRecord.get("output_index"),
            address: factRecord.get("address"),
            slot: factRecord.get("slot"),
            statement_hash: factRecord.get("statement_hash"),
            publication_cost: factRecord.get("publication_cost"),
            participating_nodes: factRecord.get("participating_nodes") || [],
            storage_cost: factRecord.get("storage_cost"),
            sources: factRecord.get("sources") || [],
            content_signature: factRecord.get("content_signature"),
            collection_date: factRecord.get("collection_date"),
            is_archive_indexed: factRecord.get("is_archive_indexed"),
        };
    },

    // Get nearest historical value for a feed
    getNearestValue: (date, networkId, feedId) => {
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
    },

    // Get historical values for a feed
    getHistoricalValues: (networkId, feedId) => {
        const oneDayAgoFilter = dateUtils.getFormattedDateFilter(1);
        const threeDaysAgoFilter = dateUtils.getFormattedDateFilter(3);
        const sevenDaysAgoFilter = dateUtils.getFormattedDateFilter(7);

        return {
            oneDayAgo: dbUtils.getNearestValue(oneDayAgoFilter, networkId, feedId),
            threeDaysAgo: dbUtils.getNearestValue(threeDaysAgoFilter, networkId, feedId),
            sevenDaysAgo: dbUtils.getNearestValue(sevenDaysAgoFilter, networkId, feedId),
        };
    },
};

// Export utilities for use in other files
if (typeof module !== "undefined" && module.exports) {
    module.exports = { dateUtils, dbUtils };
}
