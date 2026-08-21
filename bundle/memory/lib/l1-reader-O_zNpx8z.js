//#region vendor/lib/core/record/l1-reader.js
const TAG = "[memory-tdai] [l1-reader]";
/**
* Query L1 memory records from SQLite via VectorStore.
*
* This is the **preferred** read path — it uses the composite index
* `idx_l1_session_updated(session_id, updated_time)` for efficient
* session-scoped and time-range queries.
*
* All timestamps are UTC ISO 8601 (as stored by l1-writer's dual-write).
*
* Falls back to empty array if VectorStore is null or degraded.
*/
async function queryMemoryRecords(vectorStore, filter, logger) {
	if (!vectorStore) {
		logger?.warn(`${TAG} queryMemoryRecords: no VectorStore available, returning empty`);
		return [];
	}
	return (await vectorStore.queryL1Records(filter)).map(rowToMemoryRecord);
}
/**
* Convert a raw SQLite L1RecordRow to a MemoryRecord (same shape as JSONL records).
*/
function rowToMemoryRecord(row) {
	let metadata = {};
	try {
		metadata = JSON.parse(row.metadata_json);
	} catch {}
	const timestamps = [];
	if (row.timestamp_str) timestamps.push(row.timestamp_str);
	if (row.timestamp_start && row.timestamp_start !== row.timestamp_str) timestamps.push(row.timestamp_start);
	if (row.timestamp_end && row.timestamp_end !== row.timestamp_str && row.timestamp_end !== row.timestamp_start) timestamps.push(row.timestamp_end);
	return {
		id: row.record_id,
		content: row.content,
		type: row.type,
		priority: row.priority,
		scene_name: row.scene_name,
		source_message_ids: [],
		metadata,
		timestamps,
		createdAt: row.created_time,
		updatedAt: row.updated_time,
		version: row.version ?? 0,
		sessionKey: row.session_key,
		sessionId: row.session_id,
		taskId: row.task_id,
		teamId: row.team_id,
		userId: row.user_id,
		agentId: row.agent_id
	};
}
//#endregion
export { queryMemoryRecords };
