// 게임사 및 게임 관련 타입 정의

export type ProviderStatus = 'active' | 'inactive' | 'maintenance';
export type GameStatus = 'active' | 'inactive' | 'maintenance';
export type GameType = 'slot' | 'live' | 'table' | 'video' | 'other';
export type ProviderType = 'invest' | 'honor' | 'ace';

// 기본 게임사 인터페이스
export interface BaseGameProvider {
  id: string;
  provider_code: string;
  provider_name: string;
  api_endpoint: string;
  api_key?: string;
  api_secret?: string;
  status: ProviderStatus;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// 기본 게임 인터페이스
export interface BaseGame {
  id: string;
  provider_id: string;
  game_code: string;
  game_name: string;
  game_type?: GameType;
  thumbnail_url?: string;
  status: GameStatus;
  rtp?: number;
  min_bet?: number;
  max_bet?: number;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// INVEST 게임사 타입
export interface GameProviderInvest extends BaseGameProvider {}
export interface GameInvest extends BaseGame {}

// HONOR 게임사 타입
export interface GameProviderHonor extends BaseGameProvider {}
export interface GameHonor extends BaseGame {}

// 레벨별 게임사 할당
export interface LevelProviderAssignment {
  id: string;
  level: string; // VIP, VVIP, 일반 등
  provider_type: ProviderType;
  provider_id: string;
  is_enabled: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

// API 요청/응답 타입
export interface CreateGameProviderRequest {
  provider_code: string;
  provider_name: string;
  api_endpoint: string;
  api_key?: string;
  api_secret?: string;
  status?: ProviderStatus;
  settings?: Record<string, any>;
}

export interface UpdateGameProviderRequest {
  provider_name?: string;
  api_endpoint?: string;
  api_key?: string;
  api_secret?: string;
  status?: ProviderStatus;
  settings?: Record<string, any>;
}

export interface CreateGameRequest {
  provider_id: string;
  game_code: string;
  game_name: string;
  game_type?: GameType;
  thumbnail_url?: string;
  status?: GameStatus;
  rtp?: number;
  min_bet?: number;
  max_bet?: number;
  metadata?: Record<string, any>;
}

export interface UpdateGameRequest {
  game_name?: string;
  game_type?: GameType;
  thumbnail_url?: string;
  status?: GameStatus;
  rtp?: number;
  min_bet?: number;
  max_bet?: number;
  metadata?: Record<string, any>;
}

export interface AssignProviderToLevelRequest {
  level: string;
  provider_type: ProviderType;
  provider_id: string;
  is_enabled?: boolean;
  priority?: number;
}

// API 응답 타입
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// 게임 목록 응답 (provider 정보 포함)
export interface GameWithProvider extends BaseGame {
  provider?: BaseGameProvider;
}
