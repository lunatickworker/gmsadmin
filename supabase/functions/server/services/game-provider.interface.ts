// 게임사 API 통합을 위한 공통 인터페이스

import type {
  BaseGameProvider,
  BaseGame,
  CreateGameProviderRequest,
  UpdateGameProviderRequest,
  CreateGameRequest,
  UpdateGameRequest,
} from "../types/game-provider.types";

// 모든 게임사가 구현해야 하는 공통 인터페이스
export interface IGameProviderService {
  // 게임사 관리
  getProviders(): Promise<BaseGameProvider[]>;
  getProviderById(id: string): Promise<BaseGameProvider | null>;
  getProviderByCode(code: string): Promise<BaseGameProvider | null>;
  createProvider(data: CreateGameProviderRequest): Promise<BaseGameProvider>;
  updateProvider(id: string, data: UpdateGameProviderRequest): Promise<BaseGameProvider>;
  deleteProvider(id: string): Promise<void>;

  // 게임 관리
  getGames(providerId?: string): Promise<BaseGame[]>;
  getGameById(id: string): Promise<BaseGame | null>;
  getGameByCode(code: string): Promise<BaseGame | null>;
  createGame(data: CreateGameRequest): Promise<BaseGame>;
  updateGame(id: string, data: UpdateGameRequest): Promise<BaseGame>;
  deleteGame(id: string): Promise<void>;

  // 게임사 외부 API 연동 (각 게임사마다 다르게 구현)
  syncGamesFromProvider(providerId: string): Promise<number>; // 동기화된 게임 수 반환
  launchGame(gameCode: string, userId: string, options?: any): Promise<string>; // 게임 URL 반환
  getGameBalance(userId: string): Promise<number>;
}

// 게임사 서비스 팩토리
export interface IGameProviderServiceFactory {
  getService(providerType: 'invest' | 'honor' | 'ace'): IGameProviderService;
}
