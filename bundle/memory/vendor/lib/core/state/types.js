/**
 * IStateBackend — Pipeline 状态后端抽象层
 *
 * 架构文档 §5.1 / 需求 #7.1
 *
 * Core/Worker/Timer Scanner 面向此接口编程，通过配置切换后端：
 * - LocalStateBackend  (单机，零外部依赖)
 * - RemoteStateBackend (服务化部署)
 *
 * 接口从现有 MemoryPipelineManager 中提取：
 * - Buffer    ← messageBuffers (Map<string, CapturedMessage[]>)
 * - State     ← sessionStates  (Map<string, PipelineSessionState>)
 * - Timer     ← ManagedTimer (l1Idle, l2Schedule)
 * - Queue     ← SerialQueue (l1Queue, l2Queue, l3Queue)
 * - Lock      ← l3Running / l3Pending 互斥
 * - Capture   ← notifyConversation 的 count+threshold+enqueue 原子操作
 */
export const DEFAULT_PIPELINE_STATE = {
    conversation_count: 0,
    last_extraction_time: "",
    last_extraction_updated_time: "",
    last_active_time: 0,
    l2_pending_l1_count: 0,
    warmup_threshold: 0,
    l2_last_extraction_time: "",
};
