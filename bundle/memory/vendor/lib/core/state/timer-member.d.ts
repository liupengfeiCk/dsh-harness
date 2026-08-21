import type { TaskPayload } from "./types.js";
export interface PipelineTimerMemberContext {
    teamId?: string;
    agentId?: string;
}
export interface ParsedPipelineTimerMember extends PipelineTimerMemberContext {
    sessionId: string;
    timerType: string;
    taskType: TaskPayload["type"];
    priority: number;
}
export declare function buildPipelineTimerMember(sessionId: string, timerType: string, ctx?: PipelineTimerMemberContext): string;
export declare function parseProfileSessionTenant(sessionId: string): PipelineTimerMemberContext | undefined;
export declare function parsePipelineTimerMember(member: string): ParsedPipelineTimerMember;
