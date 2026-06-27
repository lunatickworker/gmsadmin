// 레벨별 게임사 할당 관리 서비스

import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import type {
  LevelProviderAssignment,
  AssignProviderToLevelRequest,
  ProviderType,
} from "../types/game-provider.types";

export class LevelAssignmentService {
  private supabase;
  private readonly TABLE_NAME = "level_provider_assignment";

  constructor() {
    this.supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );
  }

  // 특정 레벨에 할당된 모든 게임사 조회
  async getAssignmentsByLevel(level: string): Promise<LevelProviderAssignment[]> {
    const { data, error } = await this.supabase
      .from(this.TABLE_NAME)
      .select("*")
      .eq("level", level)
      .order("priority", { ascending: true });

    if (error) throw new Error(`Error fetching assignments: ${error.message}`);
    return data as LevelProviderAssignment[];
  }

  // 특정 게임사 타입의 할당 조회
  async getAssignmentsByProviderType(providerType: ProviderType): Promise<LevelProviderAssignment[]> {
    const { data, error } = await this.supabase
      .from(this.TABLE_NAME)
      .select("*")
      .eq("provider_type", providerType)
      .order("level", { ascending: true });

    if (error) throw new Error(`Error fetching assignments: ${error.message}`);
    return data as LevelProviderAssignment[];
  }

  // 모든 할당 조회
  async getAllAssignments(): Promise<LevelProviderAssignment[]> {
    const { data, error } = await this.supabase
      .from(this.TABLE_NAME)
      .select("*")
      .order("level", { ascending: true })
      .order("priority", { ascending: true });

    if (error) throw new Error(`Error fetching assignments: ${error.message}`);
    return data as LevelProviderAssignment[];
  }

  // 레벨에 게임사 할당
  async assignProviderToLevel(request: AssignProviderToLevelRequest): Promise<LevelProviderAssignment> {
    const { data, error } = await this.supabase
      .from(this.TABLE_NAME)
      .insert({
        level: request.level,
        provider_type: request.provider_type,
        provider_id: request.provider_id,
        is_enabled: request.is_enabled ?? true,
        priority: request.priority ?? 0,
      })
      .select()
      .single();

    if (error) {
      // 중복 체크
      if (error.code === "23505") {
        throw new Error("This provider is already assigned to this level");
      }
      throw new Error(`Error assigning provider: ${error.message}`);
    }

    return data as LevelProviderAssignment;
  }

  // 할당 업데이트
  async updateAssignment(
    id: string,
    updates: Partial<Pick<LevelProviderAssignment, "is_enabled" | "priority">>
  ): Promise<LevelProviderAssignment> {
    const { data, error } = await this.supabase
      .from(this.TABLE_NAME)
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`Error updating assignment: ${error.message}`);
    return data as LevelProviderAssignment;
  }

  // 할당 삭제
  async removeAssignment(id: string): Promise<void> {
    const { error } = await this.supabase
      .from(this.TABLE_NAME)
      .delete()
      .eq("id", id);

    if (error) throw new Error(`Error removing assignment: ${error.message}`);
  }

  // 특정 레벨과 게임사 타입의 할당 조회
  async getAssignment(
    level: string,
    providerType: ProviderType,
    providerId: string
  ): Promise<LevelProviderAssignment | null> {
    const { data, error } = await this.supabase
      .from(this.TABLE_NAME)
      .select("*")
      .eq("level", level)
      .eq("provider_type", providerType)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (error) throw new Error(`Error fetching assignment: ${error.message}`);
    return data as LevelProviderAssignment | null;
  }

  // 특정 레벨에서 활성화된 게임사만 조회
  async getEnabledProvidersForLevel(level: string): Promise<LevelProviderAssignment[]> {
    const { data, error } = await this.supabase
      .from(this.TABLE_NAME)
      .select("*")
      .eq("level", level)
      .eq("is_enabled", true)
      .order("priority", { ascending: true });

    if (error) throw new Error(`Error fetching enabled providers: ${error.message}`);
    return data as LevelProviderAssignment[];
  }
}
